import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(children: ReactNode) {
  return function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {children}
      </svg>
    );
  };
}

export const IconArrowLeft = make(
  <>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </>
);

export const IconArrowUp = make(
  <>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </>
);

export const IconArrowDown = make(
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>
);

export const IconUpload = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </>
);

export const IconDownload = make(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </>
);

export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);

export const IconMoon = make(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);

export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </>
);

export const IconUndo = make(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>
);

export const IconRedo = make(
  <>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </>
);

export const IconTrash = make(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </>
);

export const IconFile = make(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8" />
  </>
);

export const IconNote = make(
  <>
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" />
    <path d="M15 3v6h6" />
  </>
);

export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />);

export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);

export const IconEye = make(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const IconEyeOff = make(
  <>
    <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2" />
    <path d="M6.6 6.6C3.8 8.5 2 12 2 12s3.5 7 10 7a9.9 9.9 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m2 2 20 20" />
  </>
);

export const IconHighlighter = make(
  <>
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z" />
  </>
);

export const IconUnderline = make(
  <>
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <path d="M4 20h16" />
  </>
);

export const IconStrike = make(
  <>
    <path d="M16 4H9a3 3 0 0 0-2.8 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <path d="M4 12h16" />
  </>
);

export const IconSquiggle = make(
  <path d="M2 16c1.7-4 3.3-4 5 0s3.3 4 5 0 3.3-4 5 0 3.3 4 5 0" />
);

export const IconBox = make(<rect x="4" y="6" width="16" height="12" rx="1.5" />);

export const IconCircle = make(<ellipse cx="12" cy="12" rx="9" ry="6.5" />);

export const IconRows = make(
  <>
    <path d="M3 6h18" />
    <path d="M3 12h13" />
    <path d="M3 18h16" />
  </>
);

export const IconLayout = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M15 9v12" />
  </>
);

export const IconCheck = make(<path d="m20 6-11 11-5-5" />);

export const IconMinimize = make(
  <>
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <path d="m14 10 7-7" />
    <path d="m3 21 7-7" />
  </>
);

export const IconMaximize = make(
  <>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </>
);

export const IconPen = make(
  <>
    <path d="m12 19 7-7 3 3-7 7-3-3z" />
    <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="m2 2 7.6 7.6" />
    <circle cx="11" cy="11" r="2" />
  </>
);

export const IconClip = make(
  <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
);

export const IconBook = make(
  <>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </>
);

export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

export const IconSpark = make(
  <>
    <path d="m12 3 1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9z" />
    <path d="M19 3v2M20 4h-2" />
  </>
);

export const IconMove = make(
  <>
    <path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3" />
    <path d="M2 12h20M12 2v20" />
  </>
);

export const IconGear = make(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </>
);

export const IconBookmark = make(
  <path d="M19 21 12 16.8 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
);

export const IconQuote = make(
  <>
    <path d="M10 8c-3 .8-4.5 2.7-4.5 5.6 0 1.6 1 2.9 2.6 2.9 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2h-.4c.3-1.4 1.3-2.5 3-3.1z" />
    <path d="M19 8c-3 .8-4.5 2.7-4.5 5.6 0 1.6 1 2.9 2.6 2.9 1.4 0 2.4-1 2.4-2.4 0-1.3-.9-2.2-2.1-2.2h-.4c.3-1.4 1.3-2.5 3-3.1z" />
  </>
);

export const IconFocus = make(
  <>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
  </>
);

export const IconZoomIn = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
    <path d="M8 11h6M11 8v6" />
  </>
);

export const IconZoomOut = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
    <path d="M8 11h6" />
  </>
);

export const IconPaste = make(
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="M9 11h6M9 15h6" />
  </>
);

export const IconDots = make(
  <>
    <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </>
);

export const IconList = make(
  <>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </>
);

export const IconSpin = make(<path d="M21 12a9 9 0 1 1-6.2-8.56" />);
