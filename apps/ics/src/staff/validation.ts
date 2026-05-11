export type StaffForm = {
  firstName: string;
  lastName: string;
  employeeId: string;
  uan: string;
  address: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  bankBranch: string;
  aadharNumber: string;
  panNumber: string;
  officialEmail: string;
  mobilePhone: string;
};

export type StaffFormErrors = Partial<Record<keyof StaffForm, string>>;

export function normalizePan(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeIfsc(value: string) {
  return value.trim().toUpperCase();
}

export function validateStaffForm(form: StaffForm): StaffFormErrors {
  const errors: StaffFormErrors = {};
  const required: Array<keyof StaffForm> = [
    "firstName",
    "lastName",
    "employeeId",
    "uan",
    "address",
    "bankAccountNumber",
    "bankIfsc",
    "bankName",
    "bankBranch",
    "aadharNumber",
    "panNumber",
    "officialEmail",
    "mobilePhone",
  ];

  for (const key of required) {
    if (!form[key].trim()) errors[key] = "Required";
  }

  const email = form.officialEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.officialEmail = "Invalid email";
  }

  const phone = form.mobilePhone.replace(/\s+/g, "");
  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) {
    errors.mobilePhone = "Invalid phone number";
  }

  const aadhar = form.aadharNumber.replace(/\s+/g, "");
  if (aadhar && !/^\d{12}$/.test(aadhar)) {
    errors.aadharNumber = "Aadhar must be 12 digits";
  }

  const pan = normalizePan(form.panNumber);
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    errors.panNumber = "Invalid PAN format";
  }

  const ifsc = normalizeIfsc(form.bankIfsc);
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    errors.bankIfsc = "Invalid IFSC format";
  }

  const uan = form.uan.replace(/\s+/g, "");
  if (uan && !/^\d{12}$/.test(uan)) {
    errors.uan = "UAN must be 12 digits";
  }

  const acct = form.bankAccountNumber.replace(/\s+/g, "");
  if (acct && !/^\d{9,18}$/.test(acct)) {
    errors.bankAccountNumber = "Account number looks invalid";
  }

  return errors;
}

export function hasFormErrors(errors: StaffFormErrors) {
  return Object.keys(errors).length > 0;
}
