import { describe, expect, it } from "vitest";
import { normalizeIfsc, normalizePan, validateStaffForm } from "./validation";

function base() {
  return {
    firstName: "A",
    lastName: "B",
    employeeId: "E001",
    uan: "123456789012",
    address: "123 Street",
    bankAccountNumber: "1234567890",
    bankIfsc: "HDFC0001234",
    bankName: "HDFC",
    bankBranch: "Main",
    aadharNumber: "123456789012",
    panNumber: "ABCDE1234F",
    officialEmail: "a@b.com",
    mobilePhone: "+911234567890",
  };
}

describe("normalize", () => {
  it("normalizes PAN to uppercase", () => {
    expect(normalizePan(" abcde1234f ")).toBe("ABCDE1234F");
  });

  it("normalizes IFSC to uppercase", () => {
    expect(normalizeIfsc(" hdfc0001234 ")).toBe("HDFC0001234");
  });
});

describe("validateStaffForm", () => {
  it("returns errors for required fields", () => {
    const errors = validateStaffForm({ ...base(), firstName: "", address: "" });
    expect(errors.firstName).toBeTruthy();
    expect(errors.address).toBeTruthy();
  });

  it("validates email", () => {
    const errors = validateStaffForm({ ...base(), officialEmail: "not-an-email" });
    expect(errors.officialEmail).toBeTruthy();
  });

  it("validates phone number", () => {
    const errors = validateStaffForm({ ...base(), mobilePhone: "abc" });
    expect(errors.mobilePhone).toBeTruthy();
  });

  it("validates Aadhar", () => {
    const errors = validateStaffForm({ ...base(), aadharNumber: "1234" });
    expect(errors.aadharNumber).toBeTruthy();
  });

  it("validates PAN", () => {
    const errors = validateStaffForm({ ...base(), panNumber: "AAAA111" });
    expect(errors.panNumber).toBeTruthy();
  });

  it("validates IFSC", () => {
    const errors = validateStaffForm({ ...base(), bankIfsc: "BAD" });
    expect(errors.bankIfsc).toBeTruthy();
  });

  it("validates UAN", () => {
    const errors = validateStaffForm({ ...base(), uan: "123" });
    expect(errors.uan).toBeTruthy();
  });

  it("validates account number", () => {
    const errors = validateStaffForm({ ...base(), bankAccountNumber: "1" });
    expect(errors.bankAccountNumber).toBeTruthy();
  });

  it("returns empty errors for valid input", () => {
    const errors = validateStaffForm(base());
    expect(Object.keys(errors).length).toBe(0);
  });
});
