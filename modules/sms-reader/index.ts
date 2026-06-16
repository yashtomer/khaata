import { requireOptionalNativeModule } from 'expo-modules-core';

export interface RawSms {
  /** Sender address / short code, e.g. "VM-HDFCBK" */
  address: string;
  /** Full message body */
  body: string;
  /** Epoch milliseconds the SMS was received */
  date: number;
}

// Resolves to null on any platform where the native module isn't present
// (iOS, web, or the Expo Go client) so the JS keeps working with mock data.
const SmsReader = requireOptionalNativeModule<{
  readInbox(maxCount: number): Promise<RawSms[]>;
}>('SmsReader');

export const isSmsReadingSupported = SmsReader != null;

/** Read the most recent `maxCount` messages from the device SMS inbox. */
export async function readInbox(maxCount = 300): Promise<RawSms[]> {
  if (!SmsReader) return [];
  return SmsReader.readInbox(maxCount);
}
