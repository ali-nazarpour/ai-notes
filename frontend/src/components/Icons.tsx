/**
 * Inline SVG icons (no icon library). They use currentColor, so they follow the theme.
 * Directional icons get the class "flip-rtl" and are mirrored in right-to-left layouts.
 */
import type { ReactNode } from "react";

function Icon({
  children,
  filled = false,
  flip = false,
  size = 20,
}: {
  children: ReactNode;
  filled?: boolean;
  flip?: boolean;
  size?: number;
}) {
  return (
    <svg
      className={flip ? "icon flip-rtl" : "icon"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export type IconComponent = () => React.JSX.Element;

const make = (paths: ReactNode, flip = false): IconComponent => {
  const Component = () => <Icon flip={flip}>{paths}</Icon>;
  return Component;
};

export const HomeIcon = make(<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" />);
export const NotesIcon = make(
  <>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4M9 12h7M9 16h7" />
  </>,
);
export const CheckCircleIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.7-5" />
  </>,
);
export const CalendarIcon = make(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const ChatIcon = make(<path d="M4 5h16v11H9l-5 4z" />);
/** A cog wheel (the previous sun-like glyph looked like the light-theme icon). */
export const SettingsIcon = make(
  <>
    <path d="M10.3 3.2a1.7 1.7 0 013.4 0l.2 1.1a1.7 1.7 0 002.5 1.1l1-.6a1.7 1.7 0 012.3 2.4l-.6 1a1.7 1.7 0 001 2.5l1.1.2a1.7 1.7 0 010 3.4l-1.1.2a1.7 1.7 0 00-1 2.5l.6 1a1.7 1.7 0 01-2.3 2.4l-1-.6a1.7 1.7 0 00-2.5 1l-.2 1.2a1.7 1.7 0 01-3.4 0l-.2-1.1a1.7 1.7 0 00-2.5-1.1l-1 .6a1.7 1.7 0 01-2.3-2.4l.6-1a1.7 1.7 0 00-1-2.5l-1.1-.2a1.7 1.7 0 010-3.4l1.1-.2a1.7 1.7 0 001-2.5l-.6-1A1.7 1.7 0 016.6 4.8l1 .6a1.7 1.7 0 002.5-1.1z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const BoardIcon = make(
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M7.5 8v7M12 8v4M16.5 8v9" />
  </>,
);
export const KeyIcon = make(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2L20 3M16.5 6.5l2.5 2.5M14 9l2 2" />
  </>,
);
export const LockIcon = make(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </>,
);
export const UnlockIcon = make(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 017.7-1.5" />
  </>,
);
export const ArchiveIcon = make(
  <>
    <rect x="3" y="4" width="18" height="4.5" rx="1" />
    <path d="M5 8.5V19a1 1 0 001 1h12a1 1 0 001-1V8.5M10 12.5h4" />
  </>,
);
export const GripIcon = make(
  <>
    <circle cx="9" cy="6" r=".9" />
    <circle cx="15" cy="6" r=".9" />
    <circle cx="9" cy="12" r=".9" />
    <circle cx="15" cy="12" r=".9" />
    <circle cx="9" cy="18" r=".9" />
    <circle cx="15" cy="18" r=".9" />
  </>,
);
export const CameraIcon = make(
  <>
    <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);
export const PhoneIcon = make(
  <path d="M5 4h3.5l1.5 4.5-2 1.5a11 11 0 006 6l1.5-2 4.5 1.5V19a1.5 1.5 0 01-1.5 1.5A16 16 0 013.5 5.5 1.5 1.5 0 015 4z" />,
);
export const MapPinIcon = make(
  <>
    <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.8" r="2.3" />
  </>,
);
export const MailIcon = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
  </>,
);
export const ClockIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const ChecklistIcon = make(
  <>
    <path d="M4 6.5l1.5 1.5L8 5.5M4 12.5L5.5 14 8 11.5M4 18.5L5.5 20 8 17.5" />
    <path d="M11 7h9M11 13h9M11 19h9" />
  </>,
);
export const CommentIcon = make(
  <path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4.5 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z" />,
);
export const AttachmentIcon = make(
  <path d="M20 11.5l-7.8 7.8a4.6 4.6 0 01-6.5-6.5l8.2-8.2a3 3 0 014.3 4.3l-8.2 8.1a1.5 1.5 0 01-2.1-2.1l7.5-7.5" />,
);
export const DescriptionIcon = make(<path d="M4 6h16M4 10h16M4 14h10M4 18h7" />);
export const DatabaseIcon = make(
  <>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </>,
);
export const DevicesIcon = make(
  <>
    <rect x="2.5" y="4.5" width="14" height="10" rx="1.5" />
    <path d="M6 18.5h7M9.5 14.5v4" />
    <rect x="17" y="9" width="4.5" height="10" rx="1" />
  </>,
);
export const DiceIcon = make(
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="8.5" cy="8.5" r=".9" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r=".9" fill="currentColor" />
    <circle cx="12" cy="12" r=".9" fill="currentColor" />
  </>,
);
export const EyeOffIcon = make(
  <>
    <path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a16 16 0 01-2.7 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18 12 18a9 9 0 004.5-1.2" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </>,
);
export const FolderIcon = make(
  <path d="M3.5 6.5a1 1 0 011-1h5l2 2.5h8a1 1 0 011 1v9.5a1 1 0 01-1 1h-15a1 1 0 01-1-1z" />,
);
export const CreditCardIcon = make(
  <>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <path d="M2.5 10h19M6 15h4" />
  </>,
);
export const WifiIcon = make(
  <>
    <path d="M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.5 16a5 5 0 017 0" />
    <circle cx="12" cy="19" r=".9" fill="currentColor" />
  </>,
);
export const SortIcon = make(<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" />);
export const ZoomInIcon = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5" />
  </>,
);
export const RotateIcon = make(<path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5" />);
export const CalendarRangeIcon = make(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h4M13.5 17h3" />
  </>,
);
export const StarIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon filled={filled}>
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
  </Icon>
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const GridIcon = make(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
  </>,
);
export const ListIcon = make(
  <>
    <path d="M9 7h11M9 12h11M9 17h11" />
    <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
  </>,
);
export const SunIcon = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </>,
);
export const MoonIcon = make(<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />);
export const MonitorIcon = make(
  <>
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
    <path d="M9 20h6M12 16.5V20" />
  </>,
);
export const CollapseIcon = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15M16 10l-2 2 2 2" />
  </>,
  true,
);
export const BackIcon = make(<path d="M10 6l-6 6 6 6M4 12h16" />, true);
export const ChevronLeftIcon = make(<path d="M15 5l-7 7 7 7" />, true);
export const ChevronRightIcon = make(<path d="M9 5l7 7-7 7" />, true);
export const ChevronDownIcon = make(<path d="M6 9l6 6 6-6" />);
export const EditIcon = make(<path d="M4 20h4L19 9l-4-4L4 16z" />);
export const TrashIcon = make(<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />);
export const TranslateIcon = make(
  <>
    <path d="M3 6h9M7.5 4v2M10 6c-.7 3.5-3 6.2-6 7.5M5.5 9.5c1 1.8 2.6 3.2 4.5 4" />
    <path d="M12.5 20l4-9 4 9M14 17h5" />
  </>,
);
export const SparkleIcon = make(
  <>
    <path d="M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z" />
    <path d="M19 16v3M17.5 17.5h3" />
  </>,
);
export const CopyIcon = make(
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M15.5 8.5v-3a1 1 0 00-1-1h-9a1 1 0 00-1 1v9a1 1 0 001 1h3" />
  </>,
);
export const CheckIcon = make(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const LogOutIcon = make(
  <path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l4-4-4-4M14 12H4" />,
  true,
);
export const UserPlusIcon = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M18 8v6M15 11h6" />
  </>,
);
export const UserIcon = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" />
  </>,
);
export const EyeIcon = ({ off = false }: { off?: boolean }) => (
  <Icon>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <path d="M4 4l16 16" />}
  </Icon>
);
export const TagIcon = make(
  <>
    <path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8-9 9z" />
    <circle cx="8" cy="8" r="1.3" />
  </>,
);
export const AlertIcon = make(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
);
export const InfoIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);
export const InboxIcon = make(
  <>
    <path d="M3.5 13.5l2.5-8h12l2.5 8v5a1 1 0 01-1 1h-15a1 1 0 01-1-1z" />
    <path d="M3.5 13.5h5l1 2.5h5l1-2.5h5" />
  </>,
);
export const MoreIcon = make(
  <>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </>,
);
export const SendIcon = make(<path d="M4 12l16-8-6 16-2.5-6.5z" />, true);
export const GlobeIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
  </>,
);
export const BrainIcon = make(
  <>
    <path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 003 3h1V4z" />
    <path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-3 3h-1V4z" />
  </>,
);
export const RefreshIcon = make(<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />);
export const DownloadIcon = make(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const UploadIcon = make(<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />);
export const PaletteIcon = make(
  <>
    <path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.6-1.8-.3-1.2.5-2.2 1.7-2.2H18a2.5 2.5 0 002.5-2.5A8.5 8.5 0 0012 3.5z" />
    <circle cx="8" cy="10" r="1" />
    <circle cx="12" cy="7.5" r="1" />
    <circle cx="16" cy="10" r="1" />
  </>,
);
export const ShieldIcon = make(<path d="M12 3l7.5 3v6c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6z" />);
export const KeyboardIcon = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </>,
);
export const FilterIcon = make(<path d="M4 6h16M7 12h10M10 18h4" />);
export const HistoryIcon = make(
  <>
    <path d="M4 12a8 8 0 102.3-5.7M4 4v4h4" />
    <path d="M12 8v4l3 2" />
  </>,
);
export const ImageIcon = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5L6 19.5" />
  </>,
);
export const VideoIcon = make(
  <>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10.5l5-3v9l-5-3z" />
  </>,
);
export const BoldIcon = make(<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />);
export const ItalicIcon = make(<path d="M14 5h-4M14 19h-4M14 5l-4 14" />);
export const UnderlineIcon = make(<path d="M7 4v7a5 5 0 0010 0V4M5 20h14" />);
export const StrikeIcon = make(
  <path d="M5 12h14M16 7c-.8-1.4-2.3-2-4-2-2.5 0-4 1.3-4 3 0 1.3.9 2.2 2.5 2.8M8 17c.8 1.4 2.3 2 4 2 2.5 0 4-1.3 4-3" />,
);
export const CodeIcon = make(<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />);
export const HighlightIcon = make(<path d="M14 4l6 6-8 8H6v-6zM4 21h7" />);
export const LinkIcon = make(
  <path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1" />,
);
export const AlignLeftIcon = make(<path d="M4 6h16M4 10h10M4 14h16M4 18h10" />);
export const AlignCenterIcon = make(<path d="M4 6h16M7 10h10M4 14h16M7 18h10" />);
export const AlignRightIcon = make(<path d="M4 6h16M10 10h10M4 14h16M10 18h10" />);
export const AlignJustifyIcon = make(<path d="M4 6h16M4 10h16M4 14h16M4 18h16" />);
export const TextIcon = make(<path d="M5 6V5h14v1M12 5v14M9 19h6" />);
export const HeadingIcon = make(<path d="M6 5v14M18 5v14M6 12h12" />);
export const BulletListIcon = make(
  <>
    <path d="M9 7h11M9 12h11M9 17h11" />
    <circle cx="5" cy="7" r="1" />
    <circle cx="5" cy="12" r="1" />
    <circle cx="5" cy="17" r="1" />
  </>,
);
export const OrderedListIcon = make(
  <path d="M10 7h10M10 12h10M10 17h10M4 6l1.5-1V9M4 15.5a1.5 1.5 0 013 0c0 1-3 2.5-3 2.5h3" />,
);
export const TodoIcon = make(
  <>
    <rect x="3.5" y="4.5" width="6" height="6" rx="1.2" />
    <path d="M5 7.5l1 1 2-2M13 7.5h7.5M3.5 14.5h6v6h-6zM13 17.5h7.5" />
  </>,
);
export const QuoteIcon = make(
  <path d="M6 17c-1.5 0-2.5-1-2.5-2.5 0-3 1.5-6 5-8M15 17c-1.5 0-2.5-1-2.5-2.5 0-3 1.5-6 5-8" />,
);
export const CodeBlockIcon = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 10l-2 2 2 2M14.5 10l2 2-2 2" />
  </>,
);
export const TableIcon = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15" />
  </>,
);
export const DividerIcon = make(<path d="M3 12h18M7 7h10M7 17h10" />);
export const WandIcon = make(<path d="M5 19L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M18 13v2M11 4h-2" />);
export const ExpandIcon = make(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);

// --- v4: documentation, blog, projects, workspaces, embeds ---
export const BookIcon = make(
  <>
    <path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A2.5 2.5 0 014 20.5zM9 7h7" />
  </>,
);
export const PenIcon = make(<path d="M15.5 4.5l4 4L8 20H4v-4zM13.5 6.5l4 4" />);
export const RocketIcon = make(
  <>
    <path d="M14 4c3.5-1 6 .5 6 .5s1.5 2.5.5 6l-6.5 6.5-6.5-6.5z" />
    <path d="M7.5 10.5L4 11l3-4h4M13.5 16.5L13 20l4-3v-4M15.5 8.5h.01M5 19c0-1.5 1-3 2.5-3" />
  </>,
);
export const ShareIcon = make(
  <>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" />
  </>,
);
export const UsersIcon = make(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 010 6.8M18 14.3c2.2.7 3.5 2.8 3.5 5.7" />
  </>,
);
export const BotIcon = make(
  <>
    <rect x="4" y="7.5" width="16" height="12" rx="3" />
    <path d="M12 3.5v4M9 13h.01M15 13h.01M9.5 16.5h5M2 12.5v3M22 12.5v3" />
  </>,
);
export const BuildingIcon = make(
  <>
    <rect x="4" y="3.5" width="11" height="17" rx="1" />
    <path d="M15 9h5v11.5h-5M7.5 7.5h1M11 7.5h1M7.5 11h1M11 11h1M7.5 14.5h1M11 14.5h1M9 20.5v-3" />
  </>,
);
export const ShieldUserIcon = make(
  <>
    <path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z" />
    <circle cx="12" cy="10.5" r="2.2" />
    <path d="M8.5 16c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2" />
  </>,
);
export const MusicIcon = make(
  <>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </>,
);
export const FileIcon = make(
  <>
    <path d="M6 3h8l5 5v13H6z" />
    <path d="M14 3v5h5" />
  </>,
);
export const BookmarkIcon = make(<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" />);
export const PlayIcon = make(
  <>
    <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
    <path d="M10 9.2v5.6l4.8-2.8z" />
  </>,
);
export const ToggleIcon = make(<path d="M5 8l3 3 3-3M13 9.5h7M5 15.5h15" />);
export const CalloutIcon = make(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M7.5 9h.01M10.5 9h6M7.5 14h9" />
  </>,
);
export const TocIcon = make(<path d="M4 6h.01M8 6h12M6 12h.01M10 12h10M6 18h.01M10 18h10" />);
export const PageLinkIcon = make(
  <>
    <path d="M6 3h8l5 5v13H6z" />
    <path d="M10 15l4-4M11 11h3v3" />
  </>,
);
export const EmbedIcon = make(
  <>
    <rect x="2.5" y="4" width="19" height="16" rx="2" />
    <path d="M2.5 8.5h19M9 12.5l-2 2 2 2M15 12.5l2 2-2 2" />
  </>,
);
export const MoneyIcon = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </>,
);
export const FlagIcon = make(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />);
export const BranchIcon = make(
  <>
    <circle cx="6" cy="5.5" r="2" />
    <circle cx="6" cy="18.5" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 7.5v9M18 10c0 4-6 3.5-11 7" />
  </>,
);
export const PinIcon = make(
  <path d="M14.5 3.5l6 6-3 1-4 4 .5 4.5-2 2-3.8-3.8L4 21.5M8.2 13.2L4.5 9.5l2-2 4.5.5 4-4z" />,
);
export const IndentIcon = make(<path d="M4 6h16M10 12h10M4 18h16M4 9.5L7 12l-3 2.5" />, true);
export const OutdentIcon = make(<path d="M4 6h16M10 12h10M4 18h16M7 9.5L4 12l3 2.5" />, true);
export const ArrowUpIcon = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDownIcon = make(<path d="M12 5v14M6 13l6 6 6-6" />);
export const FontIcon = make(
  <path d="M3 19l5.5-14L14 19M5.2 14h6.6M15.5 13.5c.5-1 1.5-1.5 2.7-1.5 1.8 0 2.8 1 2.8 2.8V19M21 16.2c-3.5-.4-5.7.3-5.7 1.6 0 1 .8 1.4 1.8 1.4 1.6 0 3.2-1 3.9-3" />,
);
export const WidthIcon = make(<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />);
export const PrinterIcon = make(
  <>
    <path d="M7 8V3.5h10V8M7 17H4.5V10a2 2 0 012-2h11a2 2 0 012 2v7H17" />
    <rect x="7" y="13.5" width="10" height="7" rx="1" />
  </>,
);
export const RestoreIcon = make(<path d="M4 4v5h5M4.6 15a8 8 0 101.6-8.4L4 9" />);
export const LayersIcon = make(<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />);
export const TargetIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r=".8" />
  </>,
);
export const NewspaperIcon = make(
  <>
    <path d="M4 5h13v14a1.5 1.5 0 01-1.5 1.5H5.5A1.5 1.5 0 014 19z" />
    <path d="M17 9h3v10a1.5 1.5 0 01-3 0M7 8.5h7M7 12h7M7 15.5h4" />
  </>,
);
export const DriveIcon = make(
  <>
    <path d="M7.5 18.5a4.5 4.5 0 01-.6-8.96A6 6 0 0118.4 8.2a4.2 4.2 0 01-.4 10.3z" />
    <path d="M12 11v5M9.8 13.2L12 11l2.2 2.2" />
  </>,
);
export const SlidesIcon = make(
  <>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M12 16.5V20M8.5 20h7M9.5 8l5 2.25-5 2.25z" />
  </>,
);
export const GraduationIcon = make(
  <>
    <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
    <path d="M6.5 11.6v4.4c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.4M21.5 9.5v5" />
  </>,
);
export const FolderPlusIcon = make(
  <>
    <path d="M3.5 6.5a1.5 1.5 0 011.5-1.5h4l2 2.2h8a1.5 1.5 0 011.5 1.5v9.3a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z" />
    <path d="M12 10.5v5M9.5 13h5" />
  </>,
);
export const FolderFilledIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 6.5A1.5 1.5 0 014.5 5h4.3a1.5 1.5 0 011.1.48L11.6 7.3h7.9A1.5 1.5 0 0121 8.8v9.7a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18.5z"
    />
  </svg>
);
export const ClockRecentIcon = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const PauseIcon = make(<path d="M8 5v14M16 5v14" />);
export const PlayFilledIcon = () => (
  <svg className="icon flip-none" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
    <path
      fill="currentColor"
      d="M7 4.8v14.4a1 1 0 001.5.86l11.2-7.2a1 1 0 000-1.72L8.5 3.94A1 1 0 007 4.8z"
    />
  </svg>
);
export const PauseFilledIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
    <rect fill="currentColor" x="6" y="4.5" width="4.2" height="15" rx="1.2" />
    <rect fill="currentColor" x="13.8" y="4.5" width="4.2" height="15" rx="1.2" />
  </svg>
);
export const SkipBackIcon = make(<path d="M18 5.5v13L8.5 12zM6 5v14" />);
export const SkipForwardIcon = make(<path d="M6 5.5v13L15.5 12zM18 5v14" />);
export const VolumeIcon = make(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
  </>,
);
export const SpeakerIcon = make(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9.5a3.5 3.5 0 010 5" />
  </>,
);
export const FlipIcon = make(
  <path d="M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5" />,
);
export const ShuffleIcon = make(
  <path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M17.5 14.5L20 17l-2.5 2.5M4 17h3.5c1.6 0 2.6-1.2 3.4-2.8M13 9.8c.9-1.6 1.9-2.8 3.5-2.8H20M17.5 4.5L20 7l-2.5 2.5" />,
);
export const FlameIcon = make(
  <path d="M12 21a6.5 6.5 0 006.5-6.5c0-4-3.5-6.5-4-10.5-2.5 1.5-4 4-4 6.5-1-.5-2-1.6-2.3-3C6.4 9.2 5.5 11.7 5.5 14.5A6.5 6.5 0 0012 21z" />,
);
export const TimerIcon = make(
  <>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M10 3h4M12 3v2.5" />
  </>,
);
export const LyricsIcon = make(
  <path d="M4 6h11M4 10h11M4 14h7M17.5 18.5V8l3-1M17.5 18.5a2 2 0 11-2-2 2 2 0 012 2z" />,
);
export const KeyboardTypeIcon = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9" />
  </>,
);
export const QuizIcon = make(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.5-1.5 1-1.5 2M12 16.5h.01" />
  </>,
);
export const HeadphonesIcon = make(
  <>
    <path d="M4 15v-3a8 8 0 0116 0v3" />
    <rect x="3" y="14" width="4.5" height="6.5" rx="1.5" />
    <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5" />
  </>,
);
export const ArchiveBoxIcon = make(
  <>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V9M10 13h4" />
  </>,
);
export const MoveIcon = make(
  <path d="M4 7.5h6l2 2h8v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5zM11 14.5h6M14.5 12l2.5 2.5-2.5 2.5" />,
  true,
);
export const SpreadsheetIcon = make(
  <>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 9h16M4 15h16M10 3v18" />
  </>,
);
export const FullscreenIcon = make(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const AlarmIcon = make(
  <>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9.5V13l2.5 1.5M4.5 4.5l3 -2.5M19.5 4.5l-3-2.5M6.5 19.5l-1.5 2M17.5 19.5l1.5 2" />
  </>,
);
export const BellRingIcon = make(
  <>
    <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 004 0M3 9a9 9 0 012.5-5M21 9a9 9 0 00-2.5-5" />
  </>,
);
export const SnoozeIcon = make(<path d="M9 4h5l-5 6h5M14 12h6l-6 8h6M4 20l5-6" />);
