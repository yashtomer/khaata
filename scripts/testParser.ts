import { parseSmsMessages } from '../src/smsParser';
import type { RawSms } from '../modules/sms-reader';

const now = Date.now();
const mk = (body: string, address: string, daysAgo = 0): RawSms => ({
  address,
  body,
  date: now - daysAgo * 86_400_000,
});

// A realistic, messy inbox: real bank/UPI debit formats mixed with the stuff
// that MUST be ignored (credits, OTPs, promos, balance alerts).
const inbox: RawSms[] = [
  mk('HDFC Bank: Rs.480.00 debited from A/c XX4821 on 14-Jun-26 to Zomato via UPI. Ref 590213. Avl Bal Rs.18,240.', 'VM-HDFCBK'),
  mk('Sent Rs.1,240.00 From HDFC Bank A/C *4821 To Swiggy Instamart On 14-06. Ref 402398. Not You? Call 18002586161', 'VK-HDFCBK'),
  mk('INR 2,399.00 spent on your ICICI Bank Card XX9012 at MYNTRA on 13-Jun-26. Avl Limit INR 47,601.', 'AD-ICICIB'),
  mk('Rs 286 paid to Uber India via UPI from your SBI account. UPI Ref 312045678901.', 'JM-SBIUPI'),
  mk('You have paid Rs.900 to BookMyShow using Google Pay. UPI transaction ID 4471209.', 'GPAY'),
  mk('Paid Rs.15,000 to VIT University from Kotak Bank A/c X1234 on 05-Jun. Txn 887766.', 'AX-KOTAKB'),
  mk('Amount of Rs.1,450.00 debited towards BESCOM Electricity bill from A/c XX4821.', 'VM-HDFCBK'),
  // ---- real ICICI UPI peer-to-peer transfer formats (should be "transfers") ----
  mk('ICICI Bank Acct XX891 debited for Rs 5000.00 on 10-Jun-26; YASHDEEP TOMAR credited. UPI:412345678901. Call 18002662 for dispute.', 'AX-ICICIT-S'),
  mk('Dear Customer, Acct XX891 is debited with Rs 4,800.00 on 01-Jun-26 and credited to PRIYA SHARMA. UPI Ref 998877665544.', 'JD-ICICIT-S'),
  mk('Rs.350.00 sent to rahul.verma@okhdfcbank from your A/c XX4821 via UPI on 07-Jun. Ref 5512.', 'VM-HDFCBK'),
  // ---- these should all be filtered out ----
  mk('Rs.50,000.00 credited to your A/c XX4821 on 01-Jun by SALARY. Avl Bal Rs.68,240.', 'VM-HDFCBK'),
  mk('123456 is your OTP for txn of Rs.999 at Amazon. Do not share with anyone.', 'VK-AMAZON'),
  mk('Get 10% cashback! Spend with your HDFC card this weekend. T&C apply.', 'VM-HDFCBK'),
  mk('Your A/c XX4821 balance is Rs.18,240.00 as on 14-Jun-26.', 'VM-HDFCBK'),
  mk('Refund of Rs.1,799 received from Amazon to your A/c XX4821.', 'VM-HDFCBK'),
];

const txns = parseSmsMessages(inbox);

console.log(`Inbox messages: ${inbox.length}`);
console.log(`Parsed as spends: ${txns.length}  (expected 10)\n`);
console.log('merchant'.padEnd(22), 'category'.padEnd(14), 'amount');
console.log('-'.repeat(46));
for (const t of txns) {
  console.log(t.merchant.padEnd(22), t.cat.padEnd(14), '₹' + t.amount);
}

const total = txns.reduce((a, t) => a + t.amount, 0);
console.log('-'.repeat(46));
console.log('TOTAL'.padEnd(36), '₹' + total.toLocaleString('en-IN'));
