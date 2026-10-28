/* =====================================================================
   BIG CHEESE KETTLE CO. EVENTS
   This is the only file you need to edit to add or change events.
   Past dates hide on their own, and every upcoming date becomes a
   pickup choice at checkout.

   Tips
   - Dates are "YYYY-MM-DD". start is the 24-hour start time ("07:30", "15:00").
   - time is what customers see ("7:30 – 11:30 AM").
   - Every event line ends with a comma. Text goes in "double quotes".
   ===================================================================== */

window.BCKC_EVENTS = {

  // How far ahead repeating events are shown, in calendar months.
  // 1 means up to the same day next month (Oct 28 shows through Nov 28).
  showRepeatingMonthsAhead: 1,

  // Events that repeat every week.
  //   every: day of the week, or a list like ["Friday", "Saturday"]
  //   from / until: first and last date (leave until out to keep going)
  //   skip: dates you won't be there
  repeating: [
    {
      name: "Aiken Farmers Market",
      where: "115 Williamsburg St NE, Aiken, SC 29801",
      every: "Saturday",
      start: "07:30",
      time: "7:30 – 11:30 AM",
      from: "2026-10-31",
      // until: "2026-12-19",
      skip: [],
    },
  ],

  // One-time events.
  oneTime: [
    { date: "2026-10-09", start: "18:00", name: "Five Elements Wellness Spa", where: "119 Beaty Ln, Aiken, SC 29803", time: "6 – 8 PM" },
    { date: "2026-10-10", start: "07:30", name: "Aiken Farmers Market", where: "115 Williamsburg St NE, Aiken, SC 29801", time: "7:30 – 11 AM" },
    { date: "2026-10-17", start: "10:00", name: "Turnkey Tailgate Festival", where: "190 Old Wagener Rd, Aiken, SC 29801", time: "10 AM – 4 PM" },
    { date: "2026-10-24", start: "07:30", name: "Aiken Farmers Market", where: "115 Williamsburg St NE, Aiken, SC 29801", time: "7:30 – 11:30 AM" },
    { date: "2026-10-24", start: "10:00", name: "Fall in Love with Downtown", where: "135 Laurens St SW, Aiken, SC 29801", time: "10 AM – 5 PM" },
    { date: "2026-10-24", start: "15:00", name: "City of Aiken Trunk or Treat", where: "Citizens Park, 1060 Banks Mill Rd, Aiken, SC 29803", time: "3 – 6 PM" },
  ],

};
