export type JsonObject = Record<string, unknown>

export type SnapshotRow = {
  payload?: unknown
  workout_count?: number
  updated_at?: string
  schema_version?: number
}

export type WorkoutFilter = {
  limit?: number
  fromDate?: string
  toDate?: string
  type?: string
}

const DAY = 86_400_000

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value))
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function instant(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(value: unknown): string | null {
  const parsed = instant(value)
  return parsed ? new Date(parsed).toISOString() : null
}

function stateFrom(row: SnapshotRow): JsonObject {
  const payload = object(row.payload)
  return object(payload.state)
}

function workoutsFrom(row: SnapshotRow): JsonObject[] {
  return array(stateFrom(row).workouts)
    .map(object)
    .filter((workout) => instant(workout.date) > 0)
    .sort((a, b) => instant(b.date) - instant(a.date))
}

function exercisesFrom(workout: JsonObject): JsonObject[] {
  return array(workout.exercises).map(object)
}

function setsFrom(exercise: JsonObject): JsonObject[] {
  return array(exercise.sets).map(object)
}

function isWorkingSet(set: JsonObject): boolean {
  return text(set.t) !== 'w'
    && (number(set.r) > 0 || number(set.rr) > 0 || number(set.sek) > 0 || number(set.dist) > 0)
}

function reps(exercise: JsonObject, set: JsonObject): number {
  const left = number(set.r)
  if (!exercise.uni) return left
  const rawRight = set.rr
  const right = rawRight === undefined || rawRight === null || rawRight === ''
    ? left
    : number(rawRight)
  return left + right
}

function profileWeight(row: SnapshotRow): number {
  const payload = object(row.payload)
  const profile = object(payload.trainingProfile)
  return number(profile.weightKg)
}

function bodyweightAt(row: SnapshotRow, date: unknown): number {
  const day = text(date).slice(0, 10)
  const entries = array(stateFrom(row).bodyweight)
    .map(object)
    .filter((entry) => text(entry.d) && number(entry.kg) > 0)
    .sort((a, b) => text(a.d).localeCompare(text(b.d)))
  let result = profileWeight(row)
  for (const entry of entries) {
    if (text(entry.d) <= day) result = number(entry.kg)
    else break
  }
  return result
}

function effectiveLoad(row: SnapshotRow, workout: JsonObject, exercise: JsonObject, set: JsonObject): number {
  const external = number(set.w)
  const bodyweight = number(exercise.bwkg) || bodyweightAt(row, workout.date)
  if (exercise.as) return Math.max(0, bodyweight - external)
  if (exercise.bw) return bodyweight + external
  return external
}

function setSummary(row: SnapshotRow, workout: JsonObject, exercise: JsonObject, set: JsonObject, index: number): JsonObject {
  const load = effectiveLoad(row, workout, exercise, set)
  const totalReps = reps(exercise, set)
  return {
    set: index + 1,
    kind: text(set.t) === 'w' ? 'warmup' : text(set.t) === 'd' ? 'drop' : 'work',
    weightKg: number(set.w),
    effectiveLoadKg: round(load, 2),
    reps: number(set.r),
    repsRight: exercise.uni ? (set.rr === '' || set.rr == null ? number(set.r) : number(set.rr)) : null,
    totalReps,
    rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
    seconds: number(set.sek) || null,
    distanceM: number(set.dist) || null,
    completedAt: isoDate(set.ts),
    volumeKg: round(load * totalReps, 1),
  }
}

function exerciseSummary(row: SnapshotRow, workout: JsonObject, exercise: JsonObject, includeSets = true): JsonObject {
  const allSets = setsFrom(exercise)
  const working = allSets.filter(isWorkingSet)
  const result: JsonObject = {
    id: text(exercise.exId),
    name: text(exercise.name) || text(exercise.exId) || 'Unbekannte Übung',
    workingSets: working.length,
    unilateral: Boolean(exercise.uni),
    bodyweightExercise: Boolean(exercise.bw),
    assistedExercise: Boolean(exercise.as),
    note: text(exercise.note) || null,
  }
  if (includeSets) result.sets = allSets.map((set, index) => setSummary(row, workout, exercise, set, index))
  return result
}

function workoutMetrics(row: SnapshotRow, workout: JsonObject): JsonObject {
  let workSets = 0
  let repsTotal = 0
  let volumeKg = 0
  let cardioSeconds = 0
  let distanceM = 0
  for (const exercise of exercisesFrom(workout)) {
    for (const set of setsFrom(exercise)) {
      if (!isWorkingSet(set)) continue
      const totalReps = reps(exercise, set)
      workSets += 1
      repsTotal += totalReps
      volumeKg += effectiveLoad(row, workout, exercise, set) * totalReps
      cardioSeconds += number(set.sek)
      distanceM += number(set.dist)
    }
  }
  const timestamps = exercisesFrom(workout)
    .flatMap((exercise) => setsFrom(exercise).map((set) => number(set.ts)).filter(Boolean))
    .sort((a, b) => a - b)
  const start = instant(workout.start)
  const end = instant(workout.end)
  const fixedMilliseconds = number(workout.durFix)
  const measuredMilliseconds = timestamps.length >= 2
    ? timestamps[timestamps.length - 1] - timestamps[0]
    : 0
  const durationMinutes = fixedMilliseconds
    ? fixedMilliseconds / 60_000
    : measuredMilliseconds > 0
      ? measuredMilliseconds / 60_000
      : start && end && end >= start
        ? (end - start) / 60_000
        : 0
  return {
    workSets,
    reps: repsTotal,
    volumeKg: round(volumeKg, 1),
    cardioSeconds,
    distanceM: round(distanceM, 1),
    durationMinutes: durationMinutes ? round(durationMinutes, 1) : null,
  }
}

function workoutSummary(row: SnapshotRow, workout: JsonObject, includeSets = true): JsonObject {
  return {
    id: text(workout.id),
    date: isoDate(workout.date),
    type: text(workout.type) || 'Andere',
    rpe: number(workout.rpe) || null,
    preLogged: Boolean(workout.vorab),
    recordedAt: isoDate(workout.erfasst),
    startedAt: isoDate(workout.start),
    endedAt: isoDate(workout.end),
    note: text(workout.note) || null,
    ...workoutMetrics(row, workout),
    exercises: exercisesFrom(workout).map((exercise) => exerciseSummary(row, workout, exercise, includeSets)),
  }
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE')
}

function exerciseMatches(exercise: JsonObject, query: string): boolean {
  const normalized = normalizeQuery(query)
  if (!normalized) return true
  return normalizeQuery(text(exercise.name)).includes(normalized)
    || normalizeQuery(text(exercise.exId)).includes(normalized)
}

export function getDataStatus(row: SnapshotRow): JsonObject {
  const state = stateFrom(row)
  const payload = object(row.payload)
  const workouts = workoutsFrom(row)
  return {
    connected: true,
    schemaVersion: Number(row.schema_version || payload.schemaVersion || 1),
    snapshotUpdatedAt: isoDate(row.updated_at),
    generatedAt: isoDate(payload.generatedAt),
    workoutCount: workouts.length,
    bodyweightEntries: array(state.bodyweight).length,
    measurementEntries: array(state.measures).length,
    goals: array(state.goals).length,
    hasActiveWorkout: Object.keys(object(state.active)).length > 0,
    newestWorkoutAt: workouts.length ? isoDate(workouts[0].date) : null,
    oldestWorkoutAt: workouts.length ? isoDate(workouts[workouts.length - 1].date) : null,
    sharedCategories: array(payload.sharedCategories),
  }
}

export function getTrainingOverview(row: SnapshotRow, daysValue = 28): JsonObject {
  const days = integer(daysValue, 28, 1, 3650)
  const workouts = workoutsFrom(row)
  const anchor = Date.now()
  const from = anchor - days * DAY
  const selected = workouts.filter((workout) => instant(workout.date) >= from && instant(workout.date) <= anchor + DAY)
  const exerciseTotals = new Map<string, {
    name: string
    sessions: number
    sets: number
    reps: number
    volume: number
    cardioSeconds: number
    distanceM: number
  }>()
  let workSets = 0
  let totalReps = 0
  let volumeKg = 0
  let cardioSeconds = 0
  let distanceM = 0
  let durationMinutes = 0
  let durationCount = 0
  const typeCounts: Record<string, number> = {}

  for (const workout of selected) {
    const metrics = workoutMetrics(row, workout)
    workSets += Number(metrics.workSets || 0)
    totalReps += Number(metrics.reps || 0)
    volumeKg += Number(metrics.volumeKg || 0)
    cardioSeconds += Number(metrics.cardioSeconds || 0)
    distanceM += Number(metrics.distanceM || 0)
    if (metrics.durationMinutes) {
      durationMinutes += Number(metrics.durationMinutes)
      durationCount += 1
    }
    const type = text(workout.type) || 'Andere'
    typeCounts[type] = (typeCounts[type] || 0) + 1
    for (const exercise of exercisesFrom(workout)) {
      const id = text(exercise.exId) || normalizeQuery(text(exercise.name))
      if (!id) continue
      const aggregate = exerciseTotals.get(id) || {
        name: text(exercise.name) || id,
        sessions: 0,
        sets: 0,
        reps: 0,
        volume: 0,
        cardioSeconds: 0,
        distanceM: 0,
      }
      aggregate.sessions += 1
      for (const set of setsFrom(exercise)) {
        if (!isWorkingSet(set)) continue
        const total = reps(exercise, set)
        aggregate.sets += 1
        aggregate.reps += total
        aggregate.volume += effectiveLoad(row, workout, exercise, set) * total
        aggregate.cardioSeconds += number(set.sek)
        aggregate.distanceM += number(set.dist)
      }
      exerciseTotals.set(id, aggregate)
    }
  }

  const exerciseBreakdown = [...exerciseTotals.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      sessions: value.sessions,
      workingSets: value.sets,
      reps: value.reps,
      volumeKg: round(value.volume, 1),
      cardioSeconds: value.cardioSeconds,
      distanceM: round(value.distanceM, 1),
    }))
    .sort((a, b) => b.workingSets - a.workingSets || b.volumeKg - a.volumeKg)

  return {
    period: {
      days,
      from: new Date(from).toISOString(),
      to: new Date(anchor).toISOString(),
    },
    workouts: selected.length,
    workoutsPerWeek: round(selected.length / days * 7, 2),
    workingSets: workSets,
    reps: totalReps,
    volumeKg: round(volumeKg, 1),
    cardioSeconds,
    distanceM: round(distanceM, 1),
    averageDurationMinutes: durationCount ? round(durationMinutes / durationCount, 1) : null,
    byType: typeCounts,
    exerciseBreakdown,
  }
}

export function listWorkouts(row: SnapshotRow, filter: WorkoutFilter = {}): JsonObject {
  const limit = integer(filter.limit, 10, 1, 50)
  const from = filter.fromDate ? instant(filter.fromDate) : 0
  const to = filter.toDate ? instant(filter.toDate) + DAY - 1 : Number.POSITIVE_INFINITY
  const type = normalizeQuery(filter.type || '')
  const selected = workoutsFrom(row)
    .filter((workout) => (!from || instant(workout.date) >= from)
      && instant(workout.date) <= to
      && (!type || normalizeQuery(text(workout.type)) === type))
    .slice(0, limit)
  return {
    count: selected.length,
    limit,
    workouts: selected.map((workout) => workoutSummary(row, workout, true)),
  }
}

export function getExerciseHistory(row: SnapshotRow, exerciseQuery: string, limitValue = 20): JsonObject {
  const query = text(exerciseQuery).trim()
  const limit = integer(limitValue, 20, 1, 100)
  if (!query) return { query, count: 0, sessions: [], error: 'exercise is required' }
  const sessions: JsonObject[] = []
  const candidates = new Map<string, string>()
  for (const workout of workoutsFrom(row)) {
    for (const exercise of exercisesFrom(workout)) {
      if (!exerciseMatches(exercise, query)) continue
      const id = text(exercise.exId) || normalizeQuery(text(exercise.name))
      candidates.set(id, text(exercise.name) || id)
      if (sessions.length < limit) {
        sessions.push({
          workoutId: text(workout.id),
          date: isoDate(workout.date),
          workoutType: text(workout.type) || 'Andere',
          ...exerciseSummary(row, workout, exercise, true),
        })
      }
    }
  }
  return {
    query,
    count: sessions.length,
    limit,
    matchedExercises: [...candidates.entries()].map(([id, name]) => ({ id, name })),
    sessions,
  }
}

export function getPersonalRecords(row: SnapshotRow, exerciseQuery = '', limitValue = 30): JsonObject {
  const query = text(exerciseQuery).trim()
  const limit = integer(limitValue, 30, 1, 100)
  const records = new Map<string, JsonObject>()
  for (const workout of workoutsFrom(row).slice().reverse()) {
    for (const exercise of exercisesFrom(workout)) {
      if (query && !exerciseMatches(exercise, query)) continue
      const id = text(exercise.exId) || normalizeQuery(text(exercise.name))
      if (!id) continue
      const current = records.get(id) || {
        id,
        name: text(exercise.name) || id,
        maxExternalWeightKg: 0,
        maxEffectiveLoadKg: 0,
        maxReps: 0,
        bestEstimatedOneRepMaxKg: 0,
        bestSetVolumeKg: 0,
        maxDurationSeconds: 0,
        maxDistanceM: 0,
        maxExternalWeightAt: null,
        maxEffectiveLoadAt: null,
        maxRepsAt: null,
        bestEstimatedOneRepMaxAt: null,
        bestSetVolumeAt: null,
        maxDurationAt: null,
        maxDistanceAt: null,
      }
      for (const set of setsFrom(exercise)) {
        if (!isWorkingSet(set)) continue
        const external = number(set.w)
        const load = effectiveLoad(row, workout, exercise, set)
        const totalReps = reps(exercise, set)
        const representativeReps = exercise.uni ? Math.max(number(set.r), number(set.rr) || number(set.r)) : number(set.r)
        const estimate = representativeReps > 0 && representativeReps <= 15
          ? load * (1 + representativeReps / 30)
          : 0
        const setVolume = load * totalReps
        const seconds = number(set.sek)
        const distance = number(set.dist)
        const date = isoDate(workout.date)
        if (external > Number(current.maxExternalWeightKg)) {
          current.maxExternalWeightKg = external
          current.maxExternalWeightAt = date
        }
        if (load > Number(current.maxEffectiveLoadKg)) {
          current.maxEffectiveLoadKg = round(load, 2)
          current.maxEffectiveLoadAt = date
        }
        if (representativeReps > Number(current.maxReps)) {
          current.maxReps = representativeReps
          current.maxRepsAt = date
        }
        if (estimate > Number(current.bestEstimatedOneRepMaxKg)) {
          current.bestEstimatedOneRepMaxKg = round(estimate, 2)
          current.bestEstimatedOneRepMaxAt = date
        }
        if (setVolume > Number(current.bestSetVolumeKg)) {
          current.bestSetVolumeKg = round(setVolume, 1)
          current.bestSetVolumeAt = date
        }
        if (seconds > Number(current.maxDurationSeconds)) {
          current.maxDurationSeconds = seconds
          current.maxDurationAt = date
        }
        if (distance > Number(current.maxDistanceM)) {
          current.maxDistanceM = round(distance, 1)
          current.maxDistanceAt = date
        }
      }
      records.set(id, current)
    }
  }
  const sorted = [...records.values()]
    .filter((record) => Number(record.maxReps) > 0
      || Number(record.maxDurationSeconds) > 0
      || Number(record.maxDistanceM) > 0)
    .sort((a, b) => text(a.name).localeCompare(text(b.name), 'de'))
    .slice(0, limit)
  return { query: query || null, count: sorted.length, records: sorted }
}

export function getTrainingPlan(row: SnapshotRow): JsonObject {
  const state = stateFrom(row)
  const payload = object(row.payload)
  const plan = object(state.plan)
  const plannedDays = Object.entries(plan)
    .map(([date, value]) => {
      const workout = object(value)
      return {
        date,
        type: text(workout.type) || 'Andere',
        exerciseIds: array(workout.exIds).map(text).filter(Boolean),
        exercises: exercisesFrom(workout).map((exercise) => exerciseSummary(row, workout, exercise, true)),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  const active = object(state.active)
  return {
    plannedDays,
    templates: array(state.templates).map((templateValue) => {
      const template = object(templateValue)
      return {
        id: text(template.id),
        name: text(template.name),
        type: text(template.type),
        exerciseIds: array(template.exIds).map(text).filter(Boolean),
      }
    }),
    customExercises: array(state.customEx),
    exerciseOptions: object(state.exOpt),
    activeWorkout: Object.keys(active).length ? workoutSummary(row, active, true) : null,
    goals: array(state.goals),
    trainingProfile: object(payload.trainingProfile),
    preferences: object(payload.trainingPreferences),
  }
}

export function getBodyMetrics(row: SnapshotRow, limitValue = 100): JsonObject {
  const limit = integer(limitValue, 100, 1, 500)
  const state = stateFrom(row)
  const bodyweight = array(state.bodyweight)
    .map(object)
    .filter((entry) => text(entry.d) && number(entry.kg) > 0)
    .sort((a, b) => text(b.d).localeCompare(text(a.d)))
    .slice(0, limit)
    .map((entry) => ({ date: text(entry.d), weightKg: number(entry.kg) }))
  const measurements = array(state.measures)
    .map(object)
    .filter((entry) => text(entry.d))
    .sort((a, b) => text(b.d).localeCompare(text(a.d)))
    .slice(0, limit)
    .map((entry) => ({
      date: text(entry.d),
      chestCm: number(entry.chest) || null,
      armCm: number(entry.arm) || null,
      waistCm: number(entry.waist) || null,
      thighCm: number(entry.thigh) || null,
      shoulderCm: number(entry.shoulder) || null,
      calfCm: number(entry.calf) || null,
      neckCm: number(entry.neck) || null,
    }))
  const chronological = bodyweight.slice().reverse()
  const first = chronological[0]
  const latest = bodyweight[0]
  return {
    limit,
    trainingProfile: object(object(row.payload).trainingProfile),
    latestBodyweight: latest || null,
    bodyweightChangeKg: first && latest
      ? round(Number(latest.weightKg) - Number(first.weightKg), 1)
      : null,
    bodyweight,
    measurements,
  }
}
