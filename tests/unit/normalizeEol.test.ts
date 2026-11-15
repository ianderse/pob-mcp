import { normalizeEol } from "../../src/pobLuaBridge.js";

describe("normalizeEol", () => {
  it("turns CRLF into LF so PoB text fields don't gain a CR per save cycle", () => {
    expect(normalizeEol("a\r\nb")).toBe("a\nb");
  });
  it("collapses CR runs left by earlier cycles into a single LF", () => {
    expect(normalizeEol("Minions deal 68% increased Damage\r\r\r\n68% increased Damage"))
      .toBe("Minions deal 68% increased Damage\n68% increased Damage");
  });
  it("leaves LF-only input unchanged", () => {
    expect(normalizeEol("a\nb\n")).toBe("a\nb\n");
  });
});
