// export function tasksFormatter(tasks: Task[], isForTomorrow: boolean): string {
//   const { dayLabel } = getDay(isForTomorrow);
//   if (!tasks.length) return `There are no tasks for *${dayLabel}* or you didn't notify me`;
//   let tasksText = `${isForTomorrow ? "*Tomorrow*" : "*Today*"}\n\n`;

//   const groupedTasks = tasks.reduce(
//     (acc, task) => {
//       acc[task.subject] = acc[task.subject] ? `${acc[task.subject]}\n${task.taskText}` : task.taskText;
//       return acc;
//     },
//     {} as Record<string, string>,
//   );

//   Object.entries(groupedTasks).forEach(([subject, taskText], i) => {
//     tasksText += `*📋 ${i + 1}. ${subject}*\n ${taskText}\n\n`;
//   });

//   return tasksText.trim();
// }

// export function dateFormatter(fullDate: Date) {
//   const day = fullDate.getDate();
//   const month = fullDate.getMonth() + 1;
//   const year = fullDate.getFullYear();

//   return `${day < 10 ? "0" : ""}${day}/${month < 10 ? "0" : ""}${month}/${year}`;
// }
