import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import QRCode from "qrcode";
import type { Theme } from "../shared";
export const themes: Record<
  Theme,
  { name: string; description: string; sample: string }
> = {
  party: {
    name: "Portrait party",
    description: "Draw someone. Guess everyone.",
    sample: "portrait",
  },
  aquarium: {
    name: "Aquarium",
    description: "An ocean of imagination",
    sample: "fish",
  },
  dinosaur: {
    name: "Dinosaur valley",
    description: "A wildly wonderful world",
    sample: "dino",
  },
  space: {
    name: "Outer space",
    description: "Little drawings. Big universe.",
    sample: "rocket",
  },
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V4H4v12h4" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    settings: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    fish: (
      <>
        <path d="M18 12c-5-8-12-7-16 0 4 7 11 8 16 0l4-5v10z" />
        <circle cx="7" cy="11" r=".6" />
      </>
    ),
    pencil: (
      <>
        <path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4M3 22h18" />
      </>
    ),
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />,
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
export function Button({
  children,
  busy = false,
  intent = "neutral",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  intent?: "primary" | "neutral" | "danger" | "ghost";
}) {
  return (
    <button
      {...props}
      className={`button button-${intent} ${className}`}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      <span className={busy ? "button-content busy-content" : "button-content"}>
        {children}
      </span>
      {busy && <span className="button-spinner spinner" aria-label="Working" />}
    </button>
  );
}
export function Brand() {
  return (
    <a href="/" className="brand">
      <span className="brand-mark">
        <Icon name="pencil" size={23} />
      </span>
      <span>
        draw the
        <span className="brand-lower">
          room<span className="brand-dot">.</span>
        </span>
      </span>
    </a>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Loading({ label = "Opening your room…" }: { label?: string }) {
  return (
    <div className="loading-region" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}
export function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (value: Theme) => void;
}) {
  return (
    <fieldset className="theme-field">
      <legend>Choose a setting</legend>
      <div className="theme-options">
        {(Object.keys(themes) as Theme[]).map((theme) => (
          <label
            className={`theme-option ${value === theme ? "is-selected" : ""}`}
            key={theme}
          >
            <input
              type="radio"
              name="theme"
              value={theme}
              checked={value === theme}
              onChange={() => onChange(theme)}
            />
            <img src={`/${theme}.svg`} alt="" />
            <span>{themes[theme].name}</span>
            <span className="radio-check">
              <Icon name="check" size={12} />
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  description,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  description?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const cancel = ref.current?.querySelector<HTMLElement>("[data-cancel]");
    cancel?.focus();
    return () => {
      ref.current?.close();
      previous.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <Button
          data-cancel
          type="button"
          intent="ghost"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </Button>
      </div>
      {description && (
        <p id="dialog-description" className="muted">
          {description}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function QR({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    QRCode.toDataURL(value, {
      width: 200,
      margin: 1,
      color: { dark: "#173f49", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((result) => {
        if (active) setSrc(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value]);
  return (
    <div className="qr-image">
      {src ? (
        <img
          src={src}
          alt="Scan to upload a drawing"
          width="132"
          height="132"
        />
      ) : failed ? (
        <span>Open the upload link below</span>
      ) : (
        <span className="spinner" />
      )}
    </div>
  );
}
export function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  return (
    <>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Link copied");
          } catch {
            setStatus(
              "Copy was blocked. Press and hold the Add a drawing link to copy it.",
            );
          }
        }}
      >
        <Icon name="copy" />
        Copy invite link
      </Button>
      <span className="copy-status" role="status">
        {status}
      </span>
    </>
  );
}
