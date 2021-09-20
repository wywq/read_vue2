/* @flow */

import config from "../config";
import { initProxy } from "./proxy";
import { initState } from "./state";
import { initRender } from "./render";
import { initEvents } from "./events";
import { mark, measure } from "../util/perf";
import { initLifecycle, callHook } from "./lifecycle";
import { initProvide, initInjections } from "./inject";
import { extend, mergeOptions, formatComponentName } from "../util/index";

let uid = 0;

/**
 * 定义 Vue.prototype._init 方法
 * @param {*} Vue //Vue 构造函数
 */
export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    //! vue 实例
    const vm: Component = this;
    //! 每个vue实例都有一个 _uid，并且是依次递增的
    vm._uid = uid++;

    // a flag to avoid this being observed
    vm._isVue = true;
    //! 处理组件配置项
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      //!子组件走这里：性能优化，减少原型链的动态查找，提高执行效率
      /**
       * 每个子组件初始化时走这里，这里只做了一些性能优化
       * 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率（减少原型链的动态查找）
       */
      initInternalComponent(vm, options);
    } else {
      //!根组件走这里：选项合并，将全局配置选项合并到跟组件的局部配置上
      /**
       * 初始化根组件时走这里，合并 Vue 的全局配置到根组件的局部配置，比如 Vue.component 注册的全局组件会合并到 根实例 的components 选项中
       * 至于每个子组件的选项合并则发生在两个地方
       *  1.Vue.component 方法注册的全局组件在注册时做了选项合并
       *  2.{ components:{xx} } 方式注册的局部组件在执行 编译器 生成的 render 函数时做了选项合并，包括根组件中的 components 配置
       */
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      );
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      //!设置代理，将 vm 实例上的属性代理到 vm._renderProxy
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }
    // expose real self
    vm._self = vm;
    //! 初始化组件实例关系属性，比如 $parent, $children, $root, $refs 等
    initLifecycle(vm);
    /**
     * 初始化自定义事件，这里需要注意一点，所有我们在 <comp @click="handleClick" /> 上注册的事件，监听者不是父组件
     * 而是子组件本身，也就是说事件的派发和监听者都是子组件本身，和父组件无关()
     */
    initEvents(vm);
    //! 解析组件的插槽信息，得到 vm.$slot，处理渲染函数，得到 vm.$createElement 方法，即 h 函数
    initRender(vm);
    //! 调用 beforeCreate 钩子函数
    callHook(vm, "beforeCreate");
    //! 初始化组件的 inject 配置项，得到results[key] = val 形式的配置对象，然后对结果数据进行响应式处理，并代理每个 key 到 vm 实例
    initInjections(vm); // resolve injections before data/props
    //! 数据响应式的重点，处理 props，methods，data，computed，watch
    initState(vm);
    //! 解析组件配置项上的 provide 对象，将其挂载到 vm._provided 属性上
    initProvide(vm); // resolve provide after data/props
    //! 调用 beforeCreate 钩子函数
    callHook(vm, "created");

    //! 如果发现配置项上有 el 选项，则自动调用 $mount 方法，也就是说有了el选项，就不需要手动调用 $mount ，反之，没有el则必须手动调用 $mount
    if (vm.$options.el) {
      //! 调用 $mount 方法，进入挂载阶段
      vm.$mount(vm.$options.el);
    }
  };
}

//!性能优化，打平配置对象上的属性，减少运行时原型链的查找，提高执行效率
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  //!基于 构造函数 上的配置对象创建 vm.$options
  const opts = (vm.$options = Object.create(vm.constructor.options));
  // doing this because it's faster than dynamic enumeration. (比动态枚举快？)
  const parentVnode = options._parentVnode;
  opts.parent = options.parent;
  opts._parentVnode = parentVnode;

  const vnodeComponentOptions = parentVnode.componentOptions;
  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  //! 如果有 render 函数，将其赋值到 vm.$options
  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

/**
 * 从组件构造函数中解析配置对象 options，并合并基类选项
 * @param {Class<Component>} Ctor
 * @return {*}
 */
export function resolveConstructorOptions(Ctor: Class<Component>) {
  //!从实例构造函数上获取选项（配置项目）
  let options = Ctor.options;
  if (Ctor.super) {
    //! 存在基类，递归解析基类构造函数的选项
    const superOptions = resolveConstructorOptions(Ctor.super);
    const cachedSuperOptions = Ctor.superOptions;
    if (superOptions !== cachedSuperOptions) {
      //!说明基类构造函数选项已经发生改变，需要重新设置
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      //! 检查 Ctor.options 上是否有任何后期修改/附加的选项
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      //! 如果存在被修改或增加的选项，则合并两个选项
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions);
      }
      //! 选项合并，将合并结果赋值为 Ctor.options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options;
}

/**
 * 解析构造函数选项中后续被修改或者增加的选项
 * @param {Class<Component>} Ctor
 * @return {*}  {?Object}
 */
function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  //! 构造函数选项
  const latest = Ctor.options;
  //! 密封的构造函数选项，备份
  const sealed = Ctor.sealedOptions;
  //! 对比两个选项，记录不一致的选项
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
