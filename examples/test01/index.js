function test(a, b) {
  const obj = (a.obj = Object.create(b));
  console.log(obj, a, b);
}
test("vm", { name: "xiaoming" });
