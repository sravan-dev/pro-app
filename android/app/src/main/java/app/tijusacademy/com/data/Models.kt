package app.tijusacademy.com.data

import org.json.JSONObject
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private fun JSONObject.str(key: String): String =
    if (isNull(key)) "" else optString(key, "")

private fun JSONObject.idOrNull(key: String): Long? =
    if (isNull(key)) null else optLong(key, 0).takeIf { it > 0 }

data class User(val id: Long, val name: String, val email: String, val role: String) {
    companion object {
        fun from(o: JSONObject) = User(o.optLong("id"), o.str("name"), o.str("email"), o.str("role"))
    }
}

/**
 * Stored times are academy wall-clock strings ('YYYY-MM-DD HH:MM[:SS]'), the
 * same values the web portal shows, so they're read and written without any
 * timezone conversion.
 */
object Times {
    private val wire = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    private val day = DateTimeFormatter.ofPattern("EEE, d MMM")
    private val clock = DateTimeFormatter.ofPattern("h:mm a")

    fun parse(s: String): LocalDateTime? {
        val m = Regex("""^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?""").find(s) ?: return null
        val g = m.groupValues
        return try {
            LocalDateTime.of(g[1].toInt(), g[2].toInt(), g[3].toInt(), g[4].toInt(), g[5].toInt(), g[6].ifEmpty { "0" }.toInt())
        } catch (e: Exception) { null }
    }

    /** Matches what the web form sends (a datetime-local value). */
    fun toWire(t: LocalDateTime): String = t.format(wire)
    fun day(t: LocalDateTime): String = t.format(day)
    fun clock(t: LocalDateTime): String = t.format(clock)

    fun range(start: LocalDateTime?, end: LocalDateTime?): String = when {
        start == null -> ""
        end == null -> "${day(start)} · ${clock(start)}"
        start.toLocalDate() == end.toLocalDate() -> "${day(start)} · ${clock(start)} – ${clock(end)}"
        else -> "${day(start)} ${clock(start)} – ${day(end)} ${clock(end)}"
    }
}

data class ClassSession(
    val id: Long,
    val courseId: Long?,
    val courseName: String,
    val tutorName: String,
    val studentId: Long?,
    val studentName: String,
    val start: LocalDateTime?,
    val end: LocalDateTime?,
    val status: String,
) {
    private val now get() = LocalDateTime.now()
    val isLive get() = status == "live" || (start != null && end != null && !start.isAfter(now) && !end.isBefore(now) && status == "scheduled")
    val isPast get() = status == "completed" || status == "cancelled" || (end != null && end.isBefore(now) && status != "live")
    /** Same rule as the web SessionCard: live or upcoming sessions can be joined. */
    val canJoin get() = !isPast && (isLive || status == "scheduled")
    val title get() = courseName.ifBlank { "Class" }

    companion object {
        fun from(o: JSONObject) = ClassSession(
            id = o.optLong("session_id"),
            courseId = o.idOrNull("course_id"),
            courseName = o.str("course_name"),
            tutorName = o.str("tutor_name"),
            studentId = o.idOrNull("student_id"),
            studentName = o.str("student_name"),
            start = Times.parse(o.str("start_time")),
            end = Times.parse(o.str("end_time")),
            status = o.str("status"),
        )
    }
}

data class Slot(
    val id: Long,
    val start: LocalDateTime?,
    val end: LocalDateTime?,
    val note: String,
    val status: String,
    val studentName: String,
) {
    companion object {
        fun from(o: JSONObject) = Slot(
            o.optLong("id"), Times.parse(o.str("start_time")), Times.parse(o.str("end_time")),
            o.str("note"), o.str("status"), o.str("student_name"),
        )
    }
}

data class TutorSummary(val id: Long, val name: String, val specialization: String, val openSlots: Int) {
    companion object {
        fun from(o: JSONObject) = TutorSummary(o.optLong("id"), o.str("name"), o.str("specialization"), o.optInt("open_slots"))
    }
}

data class Booking(
    val id: Long,
    val sessionId: Long,
    val start: LocalDateTime?,
    val end: LocalDateTime?,
    val note: String,
    val sessionStatus: String,
    val tutorName: String,
) {
    fun asSession() = ClassSession(sessionId, null, "1-on-1 with $tutorName", tutorName, null, "", start, end, sessionStatus)

    companion object {
        fun from(o: JSONObject) = Booking(
            o.optLong("id"), o.optLong("session_id"), Times.parse(o.str("start_time")), Times.parse(o.str("end_time")),
            o.str("note"), o.str("session_status"), o.str("tutor_name"),
        )
    }
}

data class CourseOption(val id: Long, val name: String, val own: Boolean)
data class StudentOption(val id: Long, val name: String, val email: String, val courseId: Long?)

/** Tutor portal data, shaped like TutorPortal.jsx builds its schedule form options. */
data class TutorData(
    val sessions: List<ClassSession>,
    val courses: List<CourseOption>,
    val students: List<StudentOption>,
) {
    companion object {
        fun from(o: JSONObject): TutorData {
            val own = o.optJSONArray("courses")?.map { CourseOption(it.optLong("id"), it.str("name"), true) } ?: emptyList()
            val students = o.optJSONArray("students")?.map {
                StudentOption(it.optLong("id"), it.str("name"), it.str("email"), it.idOrNull("course_id"))
            } ?: emptyList()
            // Own courses, plus courses assigned students are enrolled in (private 1-on-1 only).
            val courses = own.toMutableList()
            o.optJSONArray("students")?.map { it }?.forEach { s ->
                val cid = s.idOrNull("course_id") ?: return@forEach
                if (courses.none { it.id == cid }) courses += CourseOption(cid, s.str("course_name"), false)
            }
            val sessions = o.optJSONArray("sessions")?.map(ClassSession::from) ?: emptyList()
            return TutorData(sessions, courses, students)
        }
    }
}
