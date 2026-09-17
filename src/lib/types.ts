export type Role = "member" | "admin" | "super_admin";

export type LivingStatus = "living" | "deceased" | "unknown";

export type PrivacyVisibility = "everyone" | "admins_only" | "just_me" | "groups";

export const PRIVACY_FIELDS = [
  "birth_date",
  "death_date",
  "current_location",
  "facebook_url",
  "linkedin_url",
  "place_of_birth",
  "place_of_death",
] as const;

export type PrivacyField = (typeof PRIVACY_FIELDS)[number];

export type ContactType = "phone" | "email" | "address";

export interface ContactDetail {
  id: string;
  person_id: string;
  contact_type: ContactType;
  label: string | null;
  value: string;
  visibility: PrivacyVisibility;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  person_id: string | null;
  invite_id: string | null;
  created_at: string;
  last_login_at: string;
}

export interface Person {
  id: string;
  full_name: string;
  preferred_name: string | null;
  other_names: string | null;
  surname_tag: string | null;
  gender: "M" | "F" | null;
  father_id: string | null;
  mother_id: string | null;
  living_status: LivingStatus;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_order: number | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  place_of_birth: string | null;
  place_of_death: string | null;
  current_location: string | null;
  photo_url: string | null;
  photo_thumbnail_url: string | null;
  bio: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  legacy_id: string | null;
  geni_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Spouse {
  id: string;
  person_a_id: string;
  person_b_id: string;
  marriage_notes: string | null;
  created_at: string;
}

export type PendingChangeType =
  | "edit_person"
  | "add_person"
  | "add_relationship"
  | "propose_deletion";

export type PendingChangeStatus = "pending" | "approved" | "rejected";

export interface PendingChange {
  id: string;
  change_type: PendingChangeType;
  target_person_id: string | null;
  proposed_data: Record<string, unknown>;
  previous_data: Record<string, unknown>;
  note: string | null;
  status: PendingChangeStatus;
  submitted_by: string;
  reviewed_by: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_by: string;
  created_at: string;
}

export interface GroupPerson {
  id: string;
  group_id: string;
  person_id: string;
  added_by: string;
  added_at: string;
}
