import { useRef, useState } from "react";
import { FileText, ImagePlus, LoaderCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type StoredAsset = {
  key: string;
  url: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  byteSize: number;
};

type Props = {
  scope: "portfolio" | "profile" | "project" | "enquiry" | "quote";
  projectId?: number;
  label?: string;
  onUploaded: (asset: StoredAsset) => void;
};

const MAX_SIZE = 8 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function asBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const split = result.indexOf(",");
      if (split < 0) return reject(new Error("Could not encode this file."));
      resolve(result.slice(split + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function FileUpload({ scope, projectId, label = "Attach a file", onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = trpc.uploads.upload.useMutation();
  const accept = ["project", "enquiry", "quote"].includes(scope) ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!allowed.has(file.type) || (!["project", "enquiry", "quote"].includes(scope) && file.type === "application/pdf")) {
      toast.error("Choose a JPG, PNG or WebP image; project, enquiry and quote attachments also accept PDFs.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size <= 0 || file.size > MAX_SIZE) {
      toast.error("Files must be smaller than 8 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const result = await upload.mutateAsync({ fileName: file.name, contentType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf", base64: await asBase64(file), scope, ...(scope === "project" ? { projectId } : {}) });
      onUploaded({ ...result, contentType: result.contentType as StoredAsset["contentType"] });
      toast.success("File uploaded to Mono storage.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload this file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return <div className="file-upload-control">
    <input ref={inputRef} type="file" accept={accept} aria-label={label} onChange={event => void handleFiles(event.target.files)} disabled={busy} />
    <button type="button" className="btn btn-outline btn-small" onClick={() => inputRef.current?.click()} disabled={busy}>
      {busy ? <LoaderCircle size={15} className="spin" /> : scope === "project" ? <Paperclip size={15} /> : <ImagePlus size={15} />}
      {busy ? "Uploading…" : label}
    </button>
    <small>{["project", "enquiry", "quote"].includes(scope) ? "JPG, PNG, WebP or PDF · 8 MB max" : "JPG, PNG or WebP · 8 MB max"}</small>
  </div>;
}

export function StoredFileLink({ asset }: { asset: StoredAsset }) {
  const Icon = asset.contentType === "application/pdf" ? FileText : ImagePlus;
  return <a className="stored-file-link" href={asset.url} target="_blank" rel="noreferrer"><Icon size={15} /><span>{asset.fileName}</span></a>;
}
