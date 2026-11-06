package app.tijusacademy.com.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tijusacademy.com.data.Api
import app.tijusacademy.com.data.ClassSession
import app.tijusacademy.com.data.CourseOption
import app.tijusacademy.com.data.Slot
import app.tijusacademy.com.data.StudentOption
import app.tijusacademy.com.data.Times
import app.tijusacademy.com.data.TutorData
import app.tijusacademy.com.data.User
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import java.time.LocalDateTime

private val tutorTabs = listOf(
    Tab("classes", "Classes", Icons.Default.DateRange),
    Tab("availability", "Availability", Icons.AutoMirrored.Filled.List),
)

/** null = closed; a session = editing it; [NEW] = scheduling a new one. */
private val NEW = ClassSession(0, null, "", "", null, "", null, null, "scheduled")

@Composable
fun TutorApp(user: User, refreshKey: Int, onJoin: (ClassSession) -> Unit, onExpired: () -> Unit, onSignOut: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf("classes") }
    var editing by remember { mutableStateOf<ClassSession?>(null) }
    var addingSlot by remember { mutableStateOf(false) }
    var localRefresh by remember { mutableIntStateOf(0) }

    PortalShell(
        user, tutorTabs, tab, { tab = it }, onSignOut,
        floatingAction = {
            if (tab == "classes") ExtendedFloatingActionButton(
                onClick = { editing = NEW }, containerColor = Orange, contentColor = Color.White,
                icon = { Icon(Icons.Default.Add, null) }, text = { Text("Schedule class") },
            ) else ExtendedFloatingActionButton(
                onClick = { addingSlot = true }, containerColor = Orange, contentColor = Color.White,
                icon = { Icon(Icons.Default.Add, null) }, text = { Text("Add slot") },
            )
        },
    ) { padding ->
        when (tab) {
            "classes" -> TutorClasses(padding, refreshKey + localRefresh, onJoin, onEdit = { editing = it }, onExpired)
            else -> TutorAvailability(padding, localRefresh, onExpired)
        }
    }

    editing?.let { s ->
        ScheduleDialog(
            existing = s.takeIf { it.id != 0L },
            onExpired = onExpired,
            onDismiss = { editing = null },
            onSaved = { editing = null; localRefresh++ },
        )
    }
    if (addingSlot) AddSlotDialog(onExpired, onDismiss = { addingSlot = false }, onSaved = { addingSlot = false; localRefresh++ })
}

@Composable
private fun TutorClasses(
    padding: PaddingValues,
    refreshKey: Int,
    onJoin: (ClassSession) -> Unit,
    onEdit: (ClassSession) -> Unit,
    onExpired: () -> Unit,
) {
    var sessions by remember { mutableStateOf<List<ClassSession>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var ending by remember { mutableStateOf<ClassSession?>(null) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it }

    suspend fun fetch() { sessions = Api.sessions(); error = null }
    fun reload() = runner.launch { refreshing = true; try { fetch() } finally { refreshing = false } }

    LaunchedEffect(refreshKey) {
        runner.launch { fetch() }
        while (true) { delay(30_000); runner.launch { fetch() } }
    }

    val list = sessions
    val live = list?.filter { it.isLive }.orEmpty().sortedBy { it.start }
    val upcoming = list?.filter { !it.isLive && !it.isPast }.orEmpty().sortedBy { it.start }
    val past = list?.filter { it.isPast && !it.isLive }.orEmpty().sortedByDescending { it.start }.take(15)

    RefreshList(padding, refreshing, ::reload) {
        item { ErrorBanner(error) }
        item { InfoBanner(notice) }
        if (list == null) { item { Loading() }; return@RefreshList }
        if (live.isNotEmpty()) {
            item { SectionTitle("Live now") }
            items(live, key = { "l${it.id}" }) { s ->
                SessionCard(s, forStudent(s), onJoin) {
                    OutlinedButton(onClick = { ending = s }) { Text("End") }
                }
            }
        }
        item { SectionTitle("Upcoming classes") }
        if (upcoming.isEmpty()) item { EmptyState("Nothing scheduled. Tap \"Schedule class\" to add one.") }
        items(upcoming, key = { "u${it.id}" }) { s ->
            SessionCard(s, forStudent(s), onJoin) {
                // Booked 1-on-1 slots sit on a hidden course; their times are edited via the slot.
                if (s.status == "scheduled" && s.courseName != "1-on-1 Session") {
                    IconButton(onClick = { onEdit(s) }) { Icon(Icons.Default.Edit, contentDescription = "Edit") }
                }
            }
        }
        if (past.isNotEmpty()) {
            item { SectionTitle("Past classes") }
            items(past, key = { "p${it.id}" }) { s -> SessionCard(s, forStudent(s), null) }
        }
    }

    ending?.let { s ->
        AlertDialog(
            onDismissRequest = { ending = null },
            title = { Text("End this class?") },
            text = { Text("It ends for everyone and is marked completed.") },
            confirmButton = {
                TextButton(onClick = {
                    ending = null
                    runner.launch { Api.endSession(s.id); notice = "Class ended."; fetch() }
                }) { Text("End class", color = LiveRed) }
            },
            dismissButton = { TextButton(onClick = { ending = null }) { Text("Cancel") } },
        )
    }
}

private fun forStudent(s: ClassSession) = when {
    s.studentName.isNotBlank() -> "1-on-1 with ${s.studentName}"
    s.courseName == "1-on-1 Session" -> "Booked 1-on-1"
    else -> "All enrolled students"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> Picker(
    label: String,
    options: List<T>,
    selected: T?,
    text: (T) -> String,
    onSelect: (T) -> Unit,
    enabled: Boolean = true,
    placeholder: String = "Select…",
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open && enabled, onExpandedChange = { if (enabled) open = it }) {
        OutlinedTextField(
            value = selected?.let(text) ?: placeholder,
            onValueChange = {}, readOnly = true, enabled = enabled,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled),
        )
        ExposedDropdownMenu(expanded = open && enabled, onDismissRequest = { open = false }) {
            options.forEach { o ->
                DropdownMenuItem(text = { Text(text(o)) }, onClick = { onSelect(o); open = false })
            }
        }
    }
}

/** Mirrors the web tutor form: course, optional student, start and end. */
@Composable
private fun ScheduleDialog(existing: ClassSession?, onExpired: () -> Unit, onDismiss: () -> Unit, onSaved: () -> Unit) {
    var data by remember { mutableStateOf<TutorData?>(null) }
    var course by remember { mutableStateOf<CourseOption?>(null) }
    var student by remember { mutableStateOf<StudentOption?>(null) }
    var start by remember { mutableStateOf(existing?.start) }
    var end by remember { mutableStateOf(existing?.end) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it; busy = false }

    LaunchedEffect(Unit) {
        runner.launch {
            val d = TutorData.from(Api.portalData())
            data = d
            if (existing != null) {
                course = d.courses.find { it.id == existing.courseId }
                    ?: existing.courseId?.let { CourseOption(it, existing.courseName, true) }
                student = d.students.find { it.id == existing.studentId && it.courseId == existing.courseId }
                    ?: d.students.find { it.id == existing.studentId }
            }
        }
    }

    val d = data
    val courseStudents = d?.students.orEmpty().filter { it.courseId == course?.id }.distinctBy { it.id }
    // null entry = "All students (common session)", only allowed on the tutor's own course.
    val studentChoices: List<StudentOption?> = if (course?.own != false) listOf(null) + courseStudents else courseStudents

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (existing == null) "Schedule a class" else "Edit class") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ErrorBanner(error)
                if (d == null) { Loading(); return@Column }
                if (d.courses.isEmpty()) {
                    Text("You have no courses or assigned students yet. Ask the academy to assign one.", color = Muted)
                    return@Column
                }
                Picker("Course", d.courses, course, { it.name }, onSelect = { course = it; student = null })
                Picker(
                    "Student", studentChoices, student,
                    text = { it?.let { s -> "${s.name} (${s.email})" } ?: "All students (common session)" },
                    onSelect = { student = it },
                    enabled = course != null,
                    placeholder = when {
                        course == null -> "Pick a course first"
                        course?.own == false -> "Select student…"
                        else -> "All students (common session)"
                    },
                )
                Text(
                    when {
                        course == null -> "Pick a course to choose a student."
                        course?.own == true -> "Pick a student for a private 1-on-1, or leave on All for everyone enrolled."
                        else -> "This course belongs to another tutor, so pick your assigned student for a 1-on-1."
                    },
                    color = Muted, fontSize = 13.sp,
                )
                DateTimeField("Starts", start, onChange = {
                    val oldLen = if (start != null && end != null) java.time.Duration.between(start, end) else java.time.Duration.ofHours(1)
                    start = it
                    if (end == null || !end!!.isAfter(it)) end = it.plus(if (oldLen.isNegative || oldLen.isZero) java.time.Duration.ofHours(1) else oldLen)
                })
                DateTimeField("Ends", end, onChange = { end = it })
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && d != null, onClick = {
                val c = course; val s = start; val e = end
                error = when {
                    c == null -> "Pick a course."
                    !c.own && student == null -> "Pick your assigned student for this course."
                    s == null || e == null -> "Pick start and end times."
                    !e.isAfter(s) -> "End time must be after start time."
                    existing == null && e.isBefore(LocalDateTime.now()) -> "That time is already over."
                    else -> null
                }
                if (error != null || c == null || s == null || e == null) return@TextButton
                busy = true
                runner.launch {
                    if (existing == null) Api.createSession(c.id, student?.id, Times.toWire(s), Times.toWire(e))
                    else Api.updateSession(existing.id, c.id, student?.id, Times.toWire(s), Times.toWire(e))
                    busy = false
                    onSaved()
                }
            }) { Text(if (busy) "Saving…" else if (existing == null) "Schedule" else "Save") }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun TutorAvailability(padding: PaddingValues, refreshKey: Int, onExpired: () -> Unit) {
    var slots by remember { mutableStateOf<List<Slot>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Slot?>(null) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it }

    suspend fun fetch() { slots = Api.mySlots(); error = null }
    fun reload() = runner.launch { refreshing = true; try { fetch() } finally { refreshing = false } }
    LaunchedEffect(refreshKey) { runner.launch { fetch() } }

    val now = LocalDateTime.now()
    val list = slots?.filter { it.end?.isAfter(now) != false && it.status != "cancelled" }?.sortedBy { it.start }

    RefreshList(padding, refreshing, ::reload) {
        item { ErrorBanner(error) }
        item {
            Text("Open slots let students book a 1-on-1 with you. A booked slot becomes a class.", color = Muted, fontSize = 14.sp)
        }
        when {
            list == null -> item { Loading() }
            list.isEmpty() -> item { EmptyState("No upcoming slots. Tap \"Add slot\".") }
            else -> items(list, key = { it.id }) { s ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(Times.range(s.start, s.end), fontWeight = FontWeight.SemiBold)
                            if (s.status == "booked") Text("Booked by ${s.studentName.ifBlank { "a student" }}", color = Muted, fontSize = 14.sp)
                            if (s.note.isNotBlank()) Text(s.note, color = Muted, fontSize = 13.sp)
                        }
                        if (s.status == "booked") StatusPill("Booked", Color(0xFFDCFCE7), Color(0xFF166534))
                        else {
                            StatusPill("Open", Color(0xFFE4E3F5), Navy)
                            IconButton(onClick = { deleting = s }) { Icon(Icons.Default.Delete, contentDescription = "Remove slot", tint = Muted) }
                        }
                    }
                }
            }
        }
    }

    deleting?.let { s ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Remove this slot?") },
            text = { Text(Times.range(s.start, s.end)) },
            confirmButton = { TextButton(onClick = { deleting = null; runner.launch { Api.deleteSlot(s.id); fetch() } }) { Text("Remove", color = LiveRed) } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun AddSlotDialog(onExpired: () -> Unit, onDismiss: () -> Unit, onSaved: () -> Unit) {
    var start by remember { mutableStateOf<LocalDateTime?>(null) }
    var end by remember { mutableStateOf<LocalDateTime?>(null) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val runner = Runner(rememberCoroutineScope(), onExpired) { error = it; busy = false }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("Add availability") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ErrorBanner(error)
                DateTimeField("Starts", start, onChange = { start = it; if (end == null || !end!!.isAfter(it)) end = it.plusHours(1) })
                DateTimeField("Ends", end, onChange = { end = it })
                OutlinedTextField(note, { note = it.take(255) }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                val s = start; val e = end
                error = when {
                    s == null || e == null -> "Pick start and end times."
                    !e.isAfter(s) -> "End time must be after start time."
                    !e.isAfter(LocalDateTime.now()) -> "Slot must be in the future."
                    else -> null
                }
                if (error != null || s == null || e == null) return@TextButton
                busy = true
                runner.launch { Api.addSlot(Times.toWire(s), Times.toWire(e), note.trim()); busy = false; onSaved() }
            }) { Text(if (busy) "Saving…" else "Add") }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Cancel") } },
    )
}
