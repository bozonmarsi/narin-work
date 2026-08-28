// Общий "конверт" для писем компаниям из композера "Бизнес" — тот же
// фирменный стиль, что и у транзакционных писем клиентам (лого, синий/
// красный акцент), просто без бейджа статуса заказа: это письмо от
// менеджера, а не автоматическое уведомление.
const LOGO_URL = "https://static.tildacdn.com/tild3131-3033-4536-a130-623830646536/Photoroom_20260804_1.PNG";
const ACCENT = "#186ce0";
const RED = "#f44a30";
const INK = "#16181d";
const MUTED = "#7d818c";
const LINE = "#edeef1";

export function wrapBusinessEmail(bodyText: string) {
  const paragraphs = bodyText
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:${INK};">${line || "&nbsp;"}</p>`)
    .join("");

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:'Rubik',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:26px 30px 4px;">
        <img src="${LOGO_URL}" alt="NARIN — květinový atelier" width="140" style="display:block;height:auto;margin-bottom:18px;border:0;">
      </td></tr>
      <tr><td style="padding:0;"><div style="height:2px;background:${RED};"></div></td></tr>
      <tr><td style="padding:26px 30px 30px;">
        ${paragraphs}
        <div style="border-top:1px solid ${LINE};margin-top:22px;padding-top:14px;font-size:11.5px;color:${MUTED};line-height:1.6;">
          NARIN — květinový atelier s doručením po Praze<br>
          Máte otázku? Odpovězte přímo na tento e-mail, nebo napište na <a href="mailto:support@vezminarin.cz" style="color:${ACCENT};text-decoration:none;">support@vezminarin.cz</a>.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
