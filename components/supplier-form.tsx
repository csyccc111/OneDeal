"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SETTLE_MODES } from "@/lib/constants";
import { createSupplier, updateSupplier } from "@/lib/actions/supplier";

type SupplierFormProps = {
  supplier?: {
    id: number;
    name: string;
    contact: string | null;
    phone: string | null;
    settleMode: string;
    creditDays: number;
    remark: string | null;
  };
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "保存"}
    </Button>
  );
}

export function SupplierForm({ supplier }: SupplierFormProps) {
  const action = supplier ? updateSupplier : createSupplier;
  const [state, formAction] = useActionState(action, {});

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>{supplier ? "编辑供应商" : "新建供应商"}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {supplier && (
            <input type="hidden" name="id" value={supplier.id} />
          )}
          <div className="space-y-2">
            <Label htmlFor="name">
              供应商名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              defaultValue={supplier?.name ?? ""}
              required
              placeholder="如：佛山配件厂"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact">联系人</Label>
              <Input
                id="contact"
                name="contact"
                defaultValue={supplier?.contact ?? ""}
                placeholder="如：李经理"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">电话</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={supplier?.phone ?? ""}
                placeholder="手机或座机"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settleMode">结算方式</Label>
              <Select name="settleMode" defaultValue={supplier?.settleMode ?? "现金"}>
                <SelectTrigger id="settleMode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETTLE_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditDays">账期天数（月结时填写）</Label>
              <Input
                id="creditDays"
                name="creditDays"
                type="number"
                min={0}
                defaultValue={supplier?.creditDays ?? 0}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="remark">备注</Label>
            <Textarea
              id="remark"
              name="remark"
              defaultValue={supplier?.remark ?? ""}
              rows={2}
              placeholder="可选"
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <SubmitButton />
          <Button type="button" variant="ghost" onClick={() => history.back()}>
            返回
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
