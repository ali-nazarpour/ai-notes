import {
  DatabaseIcon,
  DriveIcon,
  FolderIcon,
  InboxIcon,
  MailIcon,
  SettingsIcon,
  UsersIcon,
  type IconComponent,
} from "../../components/Icons";
import type { TranslationKey } from "../../i18n";

interface AdminSection {
  id: string;
  label: TranslationKey;
  icon: IconComponent;
}

const overview: AdminSection = { id: "overview", label: "admin.overview", icon: DatabaseIcon };

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  overview,
  { id: "users", label: "admin.users", icon: UsersIcon },
  { id: "workspaces", label: "admin.stat.workspaces", icon: FolderIcon },
  { id: "email", label: "admin.email", icon: MailIcon },
  { id: "log", label: "admin.log", icon: InboxIcon },
  { id: "drive", label: "nav.drive", icon: DriveIcon },
  { id: "general", label: "admin.general", icon: SettingsIcon },
];

export function getAdminSection(id: string | undefined) {
  return ADMIN_SECTIONS.find((section) => section.id === id) ?? overview;
}
