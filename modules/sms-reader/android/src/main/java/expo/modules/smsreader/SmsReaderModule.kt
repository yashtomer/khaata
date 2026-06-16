package expo.modules.smsreader

import android.content.Context
import android.provider.Telephony
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    // Reads the most recent `maxCount` messages from the SMS inbox, newest first.
    // The READ_SMS runtime permission must already be granted (requested from JS).
    AsyncFunction("readInbox") { maxCount: Int ->
      val out = ArrayList<Map<String, Any?>>()
      val projection = arrayOf(
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        null,
        null,
        "${Telephony.Sms.DATE} DESC"
      )
      cursor?.use { c ->
        val addrIdx = c.getColumnIndex(Telephony.Sms.ADDRESS)
        val bodyIdx = c.getColumnIndex(Telephony.Sms.BODY)
        val dateIdx = c.getColumnIndex(Telephony.Sms.DATE)
        var count = 0
        while (c.moveToNext() && count < maxCount) {
          out.add(
            mapOf(
              "address" to (if (addrIdx >= 0) c.getString(addrIdx) else ""),
              "body" to (if (bodyIdx >= 0) c.getString(bodyIdx) else ""),
              "date" to (if (dateIdx >= 0) c.getLong(dateIdx) else 0L)
            )
          )
          count++
        }
      }
      out
    }
  }
}
