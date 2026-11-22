# School Report Cards (DDS Digital Solution)

A website that works on phones. Teachers enter marks, the system works out averages and class positions, and the report cards print or go to the principal on WhatsApp.

No build step. It is plain files: upload them to GitHub, deploy on Vercel, done.

## Official competence booklet (Level I)

When adding a class, choose **Official competence booklet**. The Level I Class One preset is filled in: each line is `Competence | Oral 20, Written 15, Attitude 5`. Edit it for other classes.

- Teachers type every evaluation mark per month (Month 1 to 8) on the Marks tab. Term 1 = months 1-3, Term 2 = months 4-6, Term 3 = months 7-8.
- Term mark of an evaluation = average of the months entered. Competence total = sum of its evaluations. Term total, average /20, position and appreciation (A+, A, B, C) follow automatically. Annual average = mean of the terms entered.
- Report cards print one full A4 page per pupil, with stamp and signatures. English or French.
- Best pupils, Weak subjects and Progress work for these classes too. Smart scan is for the standard format only.

## Who sees what

| Person | How they get in | What they can do |
|---|---|---|
| **Admin (you)** | Your own email and password | Create schools, set yearly expiry, switch a school on or off, renew (+1 year). **Cannot see pupils' names or marks** (the security rules block it). |
| **Principal** | Email and password, registered with the school's activation code | Add classes and subjects, give or switch off class codes, see which classes finished entering marks, see weakest subjects per class, set the WhatsApp number, open any class. |
| **Class teacher** | Class code only (no account) | Their own class on their own phone: pupils, marks, snap a mark, report cards. |

## One-time setup (about 15 minutes)

### 1. Firebase (project `reportcard-dds`)
1. **Build > Authentication > Get started.** Turn on **Email/Password** and **Anonymous**.
2. **Build > Firestore Database > Create database.** Choose production mode and a region close to you.
3. In Firestore open the **Rules** tab, delete everything, paste the whole of `firestore.rules`, press **Publish**.
4. **Project settings (gear) > General > Your apps > Web (</>)**. Register an app called `reportcard`. Copy the config values into `firebase-config.js` (replace the `PASTE_...` values; the project name is already filled in).
5. **Authentication > Users > Add user.** Add your own email and a password. Copy the **User UID** shown in the list.
6. **Firestore > Start collection** named `admins`. Document ID = the User UID you just copied. Add any field, for example `x` = `1`. This makes you the admin.

### 2. GitHub
Create a repository named `reportcard`, then **Add file > Upload files** and upload everything in this folder.

### 3. Vercel
Import the `reportcard` repository. Framework: **Other**. Leave build and output settings empty. Deploy.

Then in Firebase: **Authentication > Settings > Authorized domains > Add domain** and add your Vercel address (for example `reportcard.vercel.app`).

### 4. First use
1. Open the site > **Principal or admin** > sign in with your admin email.
2. **Add a school.** The school name is fixed and prints on every card. Copy its **activation code**.
3. The principal opens the site > **Principal or admin** > **Register my school** and enters the code.
4. The principal adds classes and gives each class code to its teacher.
5. Install on a phone: open the site in Chrome > menu > **Add to Home screen**.

## How marks and report cards work
- Marks are out of 20, entered per **term** and **sequence** (Seq 1, Seq 2).
- Subject mark = average of the sequences entered. **Student average** = sum of (subject mark x coef) divided by sum of coefs. **Class average** = average of the students' averages.
- Position: ties share a position and the next student takes the next number (1, 1, 2, 3).
- Appreciation: C 0 to under 11 (CNA), B 11 to under 15 (CPA), A 15 to under 18 (CA), A+ 18 to 20 (Exp).
- Cards are printed **one term at a time** to glue over the booklet columns. Card width and text size can be adjusted.
- Subjects are saved with a hidden ID, so renaming or reordering subjects later does not scramble existing marks.

## Smart options (new)
- **Broadsheet** (first tab): the sheet that fills the report cards. Pick term and sequence, type marks; Total, Average and Rank update live, with class average, highest, lowest and pass % underneath. **Term summary** shows the combined result the report cards are made from. **Print** (landscape) and **Print blank marks sheet** (for teachers who write by hand first) are there too.
- **Fast entry:** press Enter to go down to the next pupil in the same subject.
- **Paste marks:** paste a list from WhatsApp or Excel ("Ada Ngwa 15", or one mark per line in class order). **Check** shows who each mark goes to before anything is saved; unmatched or doubtful names are not saved.
- **Check flags:** a yellow cell means Seq 1 and Seq 2 for that subject are 8 or more points apart.
- **QR labels** (Pupils tab > QR labels): print, cut, stick one on each pupil's marks sheet or script.
- **Smart scan:** start the camera, point at the QR label (the pupil opens by itself), frame the circled mark in the white box, tap **Read mark**, check the number, **Save**. The teacher always confirms before anything is saved.
- **Automatic class teacher's remark** on each report card (from the grade and the pupil's weakest subject). Can be switched off on the Report cards tab.

## New in this version
- **Francophone bulletin:** a class set to *Francophone* gets the French card (BULLETIN SCOLAIRE, Moyenne élève, Rang, French teacher's remark). On the Report cards tab, **Language** can force English or French for any class.
- **Stamp and signature:** the principal opens **Setup**, chooses a photo of the school stamp and of the principal's signature (white paper works best), then **Save**. They print on every report card and receipt. Each class teacher can add their own signature on the Report cards tab; it stays on that phone.
- **Fees tracker (principal only):** the **Fees** tab. Set the fee for each class, tap **Pay** next to a pupil to record a payment (receipt opens for printing, or send it by WhatsApp), see Paid / Part paid / Not paid, class and school totals, and an **Owing list** with a WhatsApp **Remind** button when you saved the parent's number. A pupil can have their own fee (scholarship or discount). Class teachers cannot see fees.
- **Best pupils (automatic):** principal tab **Best pupils** shows, for the chosen term, the best pupil in each subject, the best overall in each class (with top 3), and the **best pupil in the whole school**. Class teachers get a **Best pupils** tab for their own class. Ties are all named. Overall best counts only pupils who have marks in every subject, so a half-filled sheet cannot win by accident. Printable.
- **Update step:** publish the new `firestore.rules` again (Firebase > Firestore > Rules), and upload all files to GitHub (new files: `fees.js`, `best.js`).

## Known limits in this version
- **Reading the mark from the camera** uses a free reader inside the phone's browser (`ocr.js`). It downloads about 10 MB the first time (needs internet once). It has **not been tested on real handwriting**: try it on your 3 or 4 real scripts first. If it misreads, teachers just type the mark. A paid reading service can replace it later in `ocr.js` only.
- **QR scanning** works in Chrome on Android. Browsers without it (iPhone Safari) show a name list to pick the pupil instead.
- **WhatsApp:** a website cannot attach a file to a chosen chat. "Send to principal" saves the card file and opens the principal's WhatsApp chat; the teacher attaches the saved file with the paperclip.
- Not built yet: mobile money payment, online code check per school name.
- Checked with an automated browser test of all screens against a stand-in for Firebase and a stand-in camera; QR labels were decoded back successfully. The security rules were **not** tested against real Firebase, so do a real run with one test school first (step 4 above) before any real school uses it.

## Files
`index.html`, `app.js` (screens), `fees.js` (fees tracker and receipts), `best.js` (best pupils), `calc.js` (averages, positions, scale, paste, remarks), `cards.js` (report card layout), `qr.js` (QR labels), `scan.js` (camera), `ocr.js` (mark reader), `ui.js`, `styles.css`, `firebase-config.js`, `firestore.rules`, `manifest.webmanifest`, `sw.js`, icons, `test.mjs` (`node test.mjs` checks the calculations).
