"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createCustomer, updateCustomer } from "@/lib/actions/customer";

type CustomerFormProps = {
  customer?: {
    id: number;
    name: string;
    contact: string | null;
    phone: string | null;
    wechatRemark: string | null;
    settleMode: string;
    creditDays: number;
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

export function CustomerForm({ customer }: CustomerFormProps) {
  const action = customer ? updateCustomer : createCustomer;
  const [state, formAction] = useActionState(action, {});

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>{customer ? "编辑客户" : "新建客户"}</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {customer && (
            <input type="hidden" name="id" value={customer.id} />
          )}
          <div className="space-y-2">
            <Label htmlFor="name">
              客户名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              defaultValue={customer?.name ?? ""}
              required
              placeholder="如：宏达五金厂"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact">联系人</Label>
              <Input
                id="contact"
                name="contact"
                defaultValue={customer?.contact ?? ""}
                placeholder="如：张老板"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">电话</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={customer?.phone ?? ""}
                placeholder="手机或座机"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wechatRemark">微信备注</Label>
            <Input
              id="wechatRemark"
              name="wechatRemark"
              defaultValue={customer?.wechatRemark ?? ""}
              placeholder="微信名/备注，用于搜索"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settleMode">结算方式</Label>
              <Select name="settleMode" defaultValue={customer?.settleMode ?? "现金"}>
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
                defaultValue={customer?.creditDays ?? 0}
              />
            </div>
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
