"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteCustomer } from "@/lib/actions/customer";

export function CustomerDeleteButton({
  customerId,
  customerName,
}: {
  customerId: number;
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="删除客户">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除客户</DialogTitle>
          <DialogDescription>
            确认删除客户「{customerName}」？删除后不可恢复。
          </DialogDescription>
        </DialogHeader>
        <form
          action={async (formData) => {
            const res = await deleteCustomer(formData);
            if (res.error) {
              setError(res.error);
            } else {
              setError(null);
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <input type="hidden" name="id" value={customerId} />
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DeleteSubmitButton />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "删除中…" : "确认删除"}
    </Button>
  );
}
