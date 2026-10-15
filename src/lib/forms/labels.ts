// Titles of the three Sunday School forms and the display labels for the
// coded values stored in the database. Shared by screens and exports.

export const REGISTRATION_FORM_TITLE = "Sunday School Students Registration Form";
export const REGISTER_TITLE = "Sunday School Class Attendance Register";
export const TEACHERS_FORM_TITLE = "Sunday School Teachers and Assistant Teachers Form";

export const SEX_OPTIONS = [
  { value: "male", label: "Male", short: "M" },
  { value: "female", label: "Female", short: "F" },
] as const;

export const AGE_GROUP_OPTIONS = [
  { value: "adult", label: "Adult" },
  { value: "young_adult", label: "Young Adult" },
] as const;

export const STAFF_TITLE_OPTIONS = [
  { value: "teacher", label: "Teacher" },
  { value: "assistant_teacher", label: "Assistant Teacher" },
] as const;

export type Sex = (typeof SEX_OPTIONS)[number]["value"];
export type AgeGroup = (typeof AGE_GROUP_OPTIONS)[number]["value"];
export type StaffTitle = (typeof STAFF_TITLE_OPTIONS)[number]["value"];

export function sexLabel(value: string | null | undefined): string {
  return SEX_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

export function sexShort(value: string | null | undefined): string {
  return SEX_OPTIONS.find((o) => o.value === value)?.short ?? "";
}

export function ageGroupLabel(value: string | null | undefined): string {
  return AGE_GROUP_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

export function staffTitleLabel(value: string | null | undefined): string {
  return STAFF_TITLE_OPTIONS.find((o) => o.value === value)?.label ?? "Teacher";
}

export function isSex(value: unknown): value is Sex {
  return SEX_OPTIONS.some((o) => o.value === value);
}

export function isAgeGroup(value: unknown): value is AgeGroup {
  return AGE_GROUP_OPTIONS.some((o) => o.value === value);
}

export function isStaffTitle(value: unknown): value is StaffTitle {
  return STAFF_TITLE_OPTIONS.some((o) => o.value === value);
}
