import { commands } from "./utils.js";

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
📅 ${commands.isSchedule} ${commands.isForTomorrow} - Schedule of *tomorrow*
📅 ${commands.isSchedule} _[1-5]_ - Schedule of a weekday (1 = Monday, 5 = Friday)
📅 ${commands.isSchedule} _[1-5]_ ${commands.isUpper} - Weekday schedule of the *upper* week
📅 ${commands.isSchedule} _[1-5]_ ${commands.isLower} - Weekday schedule of the *lower* week`;

export const adminHelpbox = `

*🔐 Bot Admin only*

🆔 ${commands.isConfirm} - Get the chat ID (for .env group IDs)
🗣 ${commands.isEcho} _[text]_ - Send the text as UniBot`;
