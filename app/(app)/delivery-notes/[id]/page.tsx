import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/delivery-note-print-button";
import { getDeliveryNoteWithItems } from "@/lib/services/delivery-note";
import { cnAmount } from "@/lib/cn-amount";
import { formatYuan, formatYuanMills } from "@/lib/money";
import { computeDnColumnWidths } from "@/lib/delivery-note-layout";
import {
  DELIVERY_NOTE_COMPANY,
  DELIVERY_NOTE_TERMS,
} from "@/lib/constants";

const ROWS_PER_PAGE = 8; // 模板 8 行明细，超出换页

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function DeliveryNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isInteger(noteId)) notFound();

  const note = await getDeliveryNoteWithItems(noteId);
  if (!note) notFound();

  const totalCents = note.items.reduce((s, i) => s + i.amountCents, 0);
  const totalQty = note.items.reduce((s, i) => s + i.qty, 0);
  const contact = note.contact ?? note.customer.contact ?? "";
  // 自动列宽（方案B）：窄列固定 + 弹性列按当单内容分配
  const widths = computeDnColumnWidths(note.items);
  const pages: (typeof note.items)[] = [];
  for (let i = 0; i < note.items.length; i += ROWS_PER_PAGE) {
    pages.push(note.items.slice(i, i + ROWS_PER_PAGE));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* 操作栏（打印时隐藏） */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/delivery-notes" />}>
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        <PrintButton noteId={note.id} />
        <span className="text-sm text-muted-foreground">
          已打印 {note.printedCount} 次 · 纸张/方向请在打印对话框选择（241×219 纸选横向）
        </span>
      </div>

      {/* 送货单打印区（复刻模板） */}
      {pages.map((pageItems, pageIdx) => (
        <div key={pageIdx} className="dn-sheet">
          <div className="dn-head">
            <div className="dn-company">{DELIVERY_NOTE_COMPANY.name}</div>
            <div className="dn-head-row">
              <div className="dn-head-left">
                <div className="dn-company-line">{DELIVERY_NOTE_COMPANY.address}</div>
                <div className="dn-company-line">{DELIVERY_NOTE_COMPANY.contactLine}</div>
              </div>
              <div className="dn-title-group">
                <span className="dn-title">送 货 单</span>
                <span className="dn-no">
                  NO：{note.noteNo}
                  {pages.length > 1 ? `（${pageIdx + 1}/${pages.length}）` : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="dn-customer">
            <div className="dn-cust-cell">
              客户名称：<span className="dn-value">{note.customer.name}</span>
            </div>
            <div className="dn-cust-cell">
              客户电话：<span className="dn-value">{note.customer.phone ?? ""}</span>
            </div>
            <div className="dn-cust-cell">
              送货日期：<span className="dn-value">{fmtDate(note.noteDate)}</span>
            </div>
            <div className="dn-cust-cell dn-cust-wide">
              客户地址：<span className="dn-value">{note.address ?? ""}</span>
            </div>
            <div className="dn-cust-cell">
              联 系 人：<span className="dn-value">{contact}</span>
            </div>
          </div>

          <table className="dn-table">
            <colgroup>
              <col style={{ width: `${widths.seq}%` }} />
              <col style={{ width: `${widths.order}%` }} />
              <col style={{ width: `${widths.code}%` }} />
              <col style={{ width: `${widths.product}%` }} />
              <col style={{ width: `${widths.spec}%` }} />
              <col style={{ width: `${widths.unit}%` }} />
              <col style={{ width: `${widths.qty}%` }} />
              <col style={{ width: `${widths.price}%` }} />
              <col style={{ width: `${widths.amount}%` }} />
              <col style={{ width: `${widths.note}%` }} />
            </colgroup>
            <thead>
              <tr>
                <th className="dn-col-seq">序号</th>
                <th className="dn-col-order">客户订单号</th>
                <th className="dn-col-code">物料编号</th>
                <th className="dn-col-product">产品名称</th>
                <th className="dn-col-spec">规格</th>
                <th className="dn-col-unit">单位</th>
                <th className="dn-col-qty">数量</th>
                <th className="dn-col-price">单价</th>
                <th className="dn-col-amount">金额</th>
                <th className="dn-col-note">备注</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS_PER_PAGE }, (_, i) => {
                const it = pageItems[i];
                return (
                  <tr key={i}>
                    <td className="dn-cell dn-col-seq">{it ? i + 1 : ""}</td>
                    <td className="dn-cell dn-col-order">{it?.customerOrderNo ?? ""}</td>
                    <td className="dn-cell dn-col-code">{it?.itemCode ?? ""}</td>
                    <td className="dn-cell dn-col-product">{it?.product ?? ""}</td>
                    <td className="dn-cell dn-col-spec">{it?.spec ?? ""}</td>
                    <td className="dn-cell dn-col-unit">{it?.unit ?? ""}</td>
                    <td className="dn-cell dn-col-qty">{it?.qty ?? ""}</td>
                    <td className="dn-cell dn-col-price">{it ? formatYuanMills(it.unitPriceMills) : ""}</td>
                    <td className="dn-cell dn-col-amount">{it ? formatYuan(it.amountCents) : ""}</td>
                    <td className="dn-cell dn-col-note">{it?.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="dn-total">
            <div className="dn-total-cell dn-total-wide">
              金额合计（大 写）：<span className="dn-value">{cnAmount(totalCents)}</span>
            </div>
            <div className="dn-total-cell">
              小写金额 <span className="dn-value">￥{formatYuan(totalCents)}</span>
            </div>
          </div>

          <div className="dn-terms">{DELIVERY_NOTE_TERMS}</div>

          <div className="dn-sign">
            <div className="dn-sign-cell">送货单位及经手人（盖章）：</div>
            <div className="dn-sign-cell">收货单位及经手人（盖章）：</div>
          </div>

          {note.remark && (
            <div className="dn-remark">
              备注：{note.remark} · 共 {totalQty} 件
            </div>
          )}
        </div>
      ))}

      {/* 屏幕预览样式（白底卡片） + 打印样式（241×219mm 针式一联） */}
      <style>{`
        .dn-sheet {
          width: 230mm;
          margin: 0 auto;
          background: #fff;
          color: #000;
          padding: 6mm 4mm;
          border: 1px solid #ddd;
          font-family: "SimSun", "NSimSun", serif;
          /* 与 Linux 主机实测一致：14px（2026-08-22 主机调整） */
          font-size: 14px;
        }
        .dn-head { text-align: left; }
        .dn-company {
          font-size: 28px;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .dn-company-line { font-size: 12px; }
        /* 地址/传真（左）与标题（右）同一行 */
        .dn-head-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin: 4px 0 4px;
        }
        .dn-head-left { display: flex; flex-direction: column; gap: 2px; }
        .dn-title-group {
          display: flex;
          flex-direction: column;
          align-items: flex-end; /* 标题 + 单号靠右上角 */
          white-space: nowrap;
        }
        .dn-title {
          font-size: 30px;
          font-weight: bold;
          letter-spacing: 10px;
        }
        .dn-no {
          font-size: 12px;
          margin-top: 2px;
        }
        .dn-customer {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          border: 1px solid #000;
          border-bottom: none;
        }
        .dn-cust-cell {
          border-bottom: 1px solid #000;
          border-right: 1px solid #000;
          padding: 3px 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dn-cust-cell:nth-child(3n) { border-right: none; }
        .dn-cust-wide { grid-column: span 2; }
        .dn-value { font-weight: bold; }
        .dn-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .dn-table th, .dn-table td {
          border: 1px solid #000;
          padding: 2px 3px;
          font-weight: normal;
          /* 列宽由 colgroup 按内容自动分配（方案B），文字全部居中（用户要求） */
          white-space: normal;
          overflow: visible;
          word-break: break-all;
          text-align: center;
        }
        .dn-table th { font-weight: bold; background: #f3f3f3; }
        /* height 对 table-cell 是最小高度语义：空白行保持 22px，内容多时自动增高换行 */
        .dn-cell { height: 22px; }
        .dn-total {
          display: grid;
          grid-template-columns: 2fr 1fr;
          border: 1px solid #000;
          border-top: none;
        }
        .dn-total-cell {
          border-right: 1px solid #000;
          padding: 4px 6px;
        }
        .dn-total-cell:last-child { border-right: none; }
        .dn-total-wide { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dn-terms {
          border: 1px solid #000;
          border-top: none;
          padding: 4px 6px;
          font-size: 11px;
        }
        .dn-sign {
          display: grid;
          grid-template-columns: 1fr 1fr;
          /* 无边框：仅两栏文字 + 盖章留空 */
        }
        .dn-sign-cell {
          padding: 6px;
          min-height: 26mm;
        }
        .dn-sign-cell:last-child { border-right: none; }
        .dn-remark { margin-top: 4px; font-size: 11px; }
        .dn-remark:not(:empty) { }

        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          /* 不强制纸张尺寸/方向：由打印对话框自由选择（241×219 自定义纸选横向，或 A4 等） */
          @page { margin: 3mm; }
          .dn-sheet {
            width: auto;
            max-width: 100%;
            margin: 0;
            border: none;
            padding: 0;
          }
          .dn-table th { background: #fff !important; -webkit-print-color-adjust: exact; }
          .dn-sheet + .dn-sheet { page-break-before: always; }
        }
      `}</style>
    </div>
  );
}
