export enum LogMessages {
  AI_MESSAGE = "AI_MESSAGE",
  CAT_HANDLER = "CAT_HANDLER",
  CODE_IMAGE = "CODE_IMAGE",
  HELPBOX_HANDLER = "HELPBOX_HANDLER",
  MAP_HANDLER = "MAP_HANDLER",
  MENTION_GROUP_PARTICIPANTS = "MENTION_GROUP_PARTICIPANTS",
  PDF_HANDLER = "PDF_HANDLER",
  QR_CODE_HANDLER = "QR_CODE_HANDLER",
  STICKER_HANDLER = "STICKER_HANDLER",
  WIKI_HANDLER = "WIKI_HANDLER",
  NEW_GAME = "NEW_GAME",
  GAME_HANDLER = "GAME_HANDLER",
  NEW_TASK = "NEW_TASK",
  SENDING_MESSAGE_TO_TEACHER = "SENDING_MESSAGE_TO_TEACHER",
  TEACHER_MESSAGE_SEND_TO_GROUP = "TEACHER_MESSAGE_SEND_TO_GROUP",
  FORWARD_MESSAGE = "FORWARD_MESSAGE",
  VIDEO_DOWNLOAD = "VIDEO_DOWNLOAD",
}

export enum userFriendlyMessages {
  AI_MESSAGE_FAIL = "Sorry, I couldn't process your request. Please try again later. " +
    "An error happened on server or maybe the rate limit is reached (1000 requests per day).",
  STICKER_ONLY_TEXT_AND_IMAGE = "Only text and image messages can be a sticker!",
  NEW_TASK_FAIL = "Hmm... An error occurred. Maybe you should notify Yusif.",
}

export enum gameMsgs {
  FINISHED = "*Oyun Bitdi!🦁*",
  ONLY_ADMINS_CAN_QUIT = "Yanlız qrupdaki Adminlər oyun bağlaya bilər!",
  START = "Yeni oyun başladıldı!🎉" +
    "\nOyun başlayandan sonra göndərilən hər mesaj cavab kimi qəbul olunur və ona görə də reaksiya göndərilir.\n" +
    "Cavablar xüsusi *AI vasitəsilə* yoxlanılır və kiçik səhvləri, bəzən sinonimləri belə qəbul edir.\n" +
    "Əgər cavabınızdan əminsinizsə, lakin AI səhv göstərirsə, pass edərək cavabınızı yoxlaya bilərsiz." +
    "\n\nPromptlar:\n/pass - Sualı ötür\n/quit - Oyunu bitir",
}
