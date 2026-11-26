import type { AnchorHTMLAttributes, MouseEvent } from 'react';

interface AppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  href: string;
  onNavigate: () => void;
}

export function isModifiedClick(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

export function itemPath(itemId: string): string {
  return `/items/${encodeURIComponent(itemId)}`;
}

export function seriesPath(libraryId: string, title: string): string {
  return `/series/${encodeURIComponent(libraryId)}/${encodeURIComponent(title)}`;
}

export function watchPath(itemId: string): string {
  return `/watch/${encodeURIComponent(itemId)}`;
}

export function libraryPath(libraryId: string): string {
  return `/libraries/${encodeURIComponent(libraryId)}`;
}

export function recentPath(libraryId: string): string {
  return `/libraries/${encodeURIComponent(libraryId)}/recent`;
}

export function consolePath(section: string): string {
  return section === 'overview' ? '/console' : `/console/${encodeURIComponent(section)}`;
}

/**
 * Semantic SPA anchor link: intercepts plain left-clicks for instant client-side navigation,
 * while letting Right-Click -> Open in New Tab, Cmd/Ctrl+Click, Middle-Click, and Copy Link
 * work natively in the browser.
 */
export function AppLink({ href, onNavigate, ...rest }: AppLinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (isModifiedClick(e)) return;
        e.preventDefault();
        onNavigate();
      }}
      {...rest}
    />
  );
}
