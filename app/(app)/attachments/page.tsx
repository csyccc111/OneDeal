import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AttachmentsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>附件</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        附件功能已集成在订单详情页内（打开任意订单即可上传截图/图纸、拍照直传、预览下载）。
      </CardContent>
    </Card>
  );
}
