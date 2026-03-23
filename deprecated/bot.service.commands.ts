// // Register Quote Group
// if (commands.isRegister && body.includes("@quote") && chat.isGroup) {
//   await sendStateTyping();
//   await this.groupService.registerGroup({ to: msg.from, isQuoteGroup: true });
//   await msg.reply("This group successfully registered as daily quote group. So you will get daily motivational quotes at 8 A.M");
//   await sendLog(`A group registered as Quote group`, msg);
// }

// @Cron("00 08 * * 1-4") async sendDailyQuote() {
//   try {
//     const quote = await getQuote();
//     const quoteText = `📜 *Quote of the day* 📜\n\n*_"${quote.quote}"_*\n\n- ${quote.author}`;
//     const quoteGroups = await this.groupService.getGroups({ isQuoteGroup: true });
//     for (const group of quoteGroups) {
//       await client.sendMessage(group.to, quoteText);
//     }
//   } catch (error) {
//     this.logger.error("sending daily quote", error);
//   }
// }
