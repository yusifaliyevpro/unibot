import { commands } from "./utils";

export const helpBox = `Hi 👋, I'm UniBot created by Yusif Aliyev. 

*❗ Don't write [ ] brackets*

🚀 ${commands.isHelp} _@[az|en]_ - Helpbox 

🧠 ${commands.isStart} - Start an intellectual Game

📄 ${commands.isPDF} - Convert to PDF (reply to a message)

🖼 ${commands.isSticker} - Text/Image to sticker (reply to message)`;

export const helpBoxAZ = `Salam 👋, Mənim adım UniBot'dur, Yusif Aliyev tərəfindən yaradılmışam.

*❗ [ ] Mötərizələrsiz yazın*

🚀 ${commands.isHelp} _@[az|en]_ - Kömək qutusu

🧠 ${commands.isStart} - İntellektual oyuna başla

📄 ${commands.isPDF} - İstənilən formatdan PDF-ə çevir (reply olaraq göndər)

🖼 ${commands.isSticker} - Şəkli/mesajı stikerə çevir (reply olaraq)`;

export const universityHelpbox = `

*Only our Chat Group and mates*

📅 ${commands.isSchedule} - Schedule of *today*
📅 ${commands.isSchedule} ${commands.isForTomorrow} - Schedule of *tomorrow*`;
