/**
 * api.js — Geotab API Wrapper
 * All Geotab API calls with caching and error handling
 *
 * NOTE: Get() has a 500 record default limit.
 * Use resultsLimit or GetFeed for large datasets.
 */

const GeotabAPI = {

  _api: null,
  _cache: {},
  _cacheTimeout: 5 * 60 * 1000, // 5 minutes

  init(api) {
    this._api = api;
    console.log('[GeotabAPI] Initialized');
  },

  // ---- GENERIC CALL WITH CACHE ----
  async call(method, params) {
    const cacheKey = method + ':' + JSON.stringify(params);
    const cached   = this._cache[cacheKey];
    if (cached && (Date.now() - cached.time) < this._cacheTimeout) {
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      this._api.call(
        method,
        params,
        (result) => {
          this._cache[cacheKey] = { data: result, time: Date.now() };
          resolve(result);
        },
        (error) => {
          console.error('[GeotabAPI] Error in', method, params, error);
          reject(new Error(error?.message || 'Unknown API error'));
        }
      );
    });
  },

  clearCache() {
    this._cache = {};
    console.log('[GeotabAPI] Cache cleared');
  },

  // ============================================================
  // DEVICES
  // ============================================================

  getDevices(groupIds = []) {
    const search = groupIds.length > 0
      ? { groups: groupIds.map(id => ({ id })) }
      : {};
    return this.call('Get', { typeName: 'Device', search, resultsLimit: 2000 });
  },

  getDeviceStatusInfo(groupIds = []) {
    const search = groupIds.length > 0
      ? { deviceSearch: { groups: groupIds.map(id => ({ id })) } }
      : {};
    return this.call('Get', { typeName: 'DeviceStatusInfo', search, resultsLimit: 2000 });
  },

  // ============================================================
  // DRIVERS
  // ============================================================

  getDrivers(groupIds = []) {
    // Geotab does not support 'Driver' as a typeName directly
    // Use 'User' with isDriver: true filter instead
    const search = { isDriver: true };
    if (groupIds.length > 0) {
      search.groups = groupIds.map(id => ({ id }));
    }
    return this.call('Get', { typeName: 'User', search, resultsLimit: 2000 });
  },

  // ============================================================
  // GROUPS
  // ============================================================

  getGroups() {
    return this.call('Get', { typeName: 'Group', search: {} });
  },

  // ============================================================
  // EXCEPTION EVENTS
  // ============================================================

  getExceptionEvents(fromDate, toDate, groupIds = []) {
    const search = {
      fromDate: fromDate.toISOString(),
      toDate:   toDate.toISOString(),
    };
    if (groupIds.length > 0) {
      search.deviceSearch = { groups: groupIds.map(id => ({ id })) };
    }
    return this.call('Get', {
      typeName:     'ExceptionEvent',
      search,
      resultsLimit: 50000
    });
  },

  getRules() {
    return this.call('Get', { typeName: 'Rule', search: {} });
  },

  async getRuleMap() {
    const rules = await this.getRules();
    const map   = {};
    rules.forEach(r => { map[r.id] = r.name; });
    return map;
  },

  // ============================================================
  // TRIPS
  // ============================================================

  getTrips(fromDate, toDate, groupIds = []) {
    const search = {
      fromDate: fromDate.toISOString(),
      toDate:   toDate.toISOString(),
    };
    if (groupIds.length > 0) {
      search.deviceSearch = { groups: groupIds.map(id => ({ id })) };
    }
    return this.call('Get', {
      typeName:     'Trip',
      search,
      resultsLimit: 50000
    });
  },

  // ============================================================
  // STATUS DATA (ENGINE DIAGNOSTICS)
  // ============================================================

  getStatusData(fromDate, toDate, diagnosticId, groupIds = []) {
    const search = {
      fromDate:         fromDate.toISOString(),
      toDate:           toDate.toISOString(),
      diagnosticSearch: { id: diagnosticId },
    };
    if (groupIds.length > 0) {
      search.deviceSearch = { groups: groupIds.map(id => ({ id })) };
    }
    return this.call('Get', { typeName: 'StatusData', search, resultsLimit: 5000 });
  },

  getEngineLightEvents(fromDate, toDate, groupIds = []) {
    return this.getStatusData(fromDate, toDate, 'DiagnosticEngineWarningId', groupIds);
  },

  getBatteryEvents(fromDate, toDate, groupIds = []) {
    return this.getStatusData(fromDate, toDate, 'DiagnosticBatteryVoltageId', groupIds);
  },

  getTirePressureEvents(fromDate, toDate, groupIds = []) {
    return this.getStatusData(fromDate, toDate, 'DiagnosticTirePressureId', groupIds);
  },

  getEngineOilEvents(fromDate, toDate, groupIds = []) {
    return this.getStatusData(fromDate, toDate, 'DiagnosticEngineOilLevelId', groupIds);
  },

  getCoolantTempEvents(fromDate, toDate, groupIds = []) {
    return this.getStatusData(fromDate, toDate, 'DiagnosticCoolantTemperatureId', groupIds);
  },

  // ============================================================
  // ANNOTATION LOGS (COACHING)
  // ============================================================

  getAnnotationLogs(fromDate, toDate, groupIds = []) {
    const search = {
      fromDate: fromDate.toISOString(),
      toDate:   toDate.toISOString(),
    };
    if (groupIds.length > 0) {
      search.deviceSearch = { groups: groupIds.map(id => ({ id })) };
    }
    return this.call('Get', {
      typeName:     'AnnotationLog',
      search,
      resultsLimit: 5000
    });
  },

  // ============================================================
  // AGGREGATE HELPERS
  // ============================================================

  // Group exception events by device ID
  groupEventsByDevice(events) {
    const map = {};
    events.forEach(evt => {
      const id = evt.device?.id || 'unknown';
      if (!map[id]) map[id] = [];
      map[id].push(evt);
    });
    return map;
  },

  // Group exception events by driver ID
  groupEventsByDriver(events) {
    const map = {};
    events.forEach(evt => {
      const id = evt.driver?.id || 'unknown';
      if (!map[id]) map[id] = [];
      map[id].push(evt);
    });
    return map;
  },

  // Aggregate trip metrics per device
  aggregateTrips(trips) {
    const map = {};
    trips.forEach(trip => {
      const id = trip.device?.id || 'unknown';
      if (!map[id]) map[id] = { miles: 0, drivingSeconds: 0, idlingSeconds: 0, days: new Set() };
      map[id].miles          += Utils.metersToMiles(trip.distance || 0);
      map[id].drivingSeconds += trip.drivingDuration || 0;
      map[id].idlingSeconds  += trip.idlingDuration  || 0;
      if (trip.start) map[id].days.add(trip.start.split('T')[0]);
    });
    // Convert Set to count
    Object.keys(map).forEach(id => {
      map[id].daysDriven = map[id].days.size;
      delete map[id].days;
    });
    return map;
  },

  // Count devices offline for N or more days
  countOfflineDevices(deviceStatusList, days = 5) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return deviceStatusList.filter(ds => {
      if (!ds.lastCommunicationDate) return false;
      return new Date(ds.lastCommunicationDate) < cutoff;
    }).length;
  },

  // ============================================================
  // CAMERA STATUS & HEALTH
  // Camera-equipped devices: Surfsight devices paired via Geotab
  // Camera health comes from StatusData diagnostics
  // ============================================================

  /**
   * Identify camera-equipped devices from the device list.
   * Surfsight cameras appear as paired devices or via device type.
   */
  getCameraDevices(allDevices) {
    return allDevices.filter(d => {
      const name = (d.name || '').toLowerCase();
      const type = (d.deviceType || '').toLowerCase();
      return (
        type.includes('surfsight') ||
        type.includes('camera')    ||
        name.includes('surfsight') ||
        name.includes('cam')       ||
        name.includes('go focus')  // GoFocus = Surfsight camera
      );
    });
  },

  /**
   * Get camera online/offline status per device.
   * Uses DeviceStatusInfo — same as GPS but filtered to camera devices.
   * Returns a map: { deviceId: { isOnline, lastSeen, minutesOffline } }
   */
  buildCameraStatusMap(deviceStatusList, cameraDevices) {
    const cameraIds = new Set(cameraDevices.map(d => d.id));
    const map = {};

    deviceStatusList.forEach(ds => {
      const devId = ds.device?.id;
      if (!devId || !cameraIds.has(devId)) return;

      const lastSeen       = ds.lastCommunicationDate
        ? new Date(ds.lastCommunicationDate) : null;
      const minutesOffline = lastSeen
        ? Math.floor((Date.now() - lastSeen) / 60000) : null;

      map[devId] = {
        isOnline:       ds.isDeviceCommunicating === true,
        lastSeen,
        minutesOffline,
        daysOffline:    minutesOffline !== null ? Math.floor(minutesOffline / 1440) : null,
      };
    });

    return map;
  },

  /**
   * Get GPS online/offline status per device.
   * Returns a map: { deviceId: { isOnline, lastSeen, daysOffline } }
   */
  buildGpsStatusMap(deviceStatusList) {
    const map = {};
    deviceStatusList.forEach(ds => {
      const devId = ds.device?.id;
      if (!devId) return;
      const lastSeen       = ds.lastCommunicationDate
        ? new Date(ds.lastCommunicationDate) : null;
      const minutesOffline = lastSeen
        ? Math.floor((Date.now() - lastSeen) / 60000) : null;

      map[devId] = {
        isOnline:    ds.isDeviceCommunicating === true,
        lastSeen,
        minutesOffline,
        daysOffline: minutesOffline !== null ? Math.floor(minutesOffline / 1440) : null,
        latitude:    ds.latitude  || null,
        longitude:   ds.longitude || null,
        speed:       ds.speed     || 0,
      };
    });
    return map;
  },

  /**
   * Get camera SD card health via StatusData.
   * Diagnostic ID for Surfsight SD card health:
   *   DiagnosticGoDeviceCameraHealthId or custom surfsight diagnostic.
   * Falls back gracefully if diagnostic not available.
   *
   * Returns array of StatusData records.
   */
  async getCameraHealthData(fromDate, toDate, groupIds = []) {
    // Surfsight camera health diagnostic IDs (Geotab integrated)
    const diagnosticIds = [
      'DiagnosticGoDeviceCameraHealthId',     // Go Device camera health
      'DiagnosticSurfsightCameraStatusId',    // Surfsight-specific
    ];

    const results = await Promise.allSettled(
      diagnosticIds.map(id => this.getStatusData(fromDate, toDate, id, groupIds))
    );

    // Combine fulfilled results
    const combined = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        r.value.forEach(item => combined.push(item));
      }
    });

    return combined;
  },

  /**
   * Build camera health map from StatusData results.
   * Returns: { deviceId: { sdHealth, lastStatus } }
   * sdHealth values: 'Healthy', 'Warning', 'Critical', 'Unknown'
   */
  buildCameraHealthMap(healthData) {
    const map = {};
    healthData.forEach(sd => {
      const devId = sd.device?.id;
      if (!devId) return;

      // StatusData value: 0=Unknown, 1=Healthy, 2=Warning, 3=Critical
      const val = sd.data ?? sd.value ?? 0;
      const labels = ['Unknown', 'Healthy', 'Warning', 'Critical'];
      const health = labels[Math.min(val, 3)] || 'Unknown';

      // Keep the most recent reading
      const existing = map[devId];
      const thisDate = sd.dateTime ? new Date(sd.dateTime) : new Date(0);
      if (!existing || thisDate > existing._date) {
        map[devId] = { sdHealth: health, lastStatus: sd.dateTime, _date: thisDate };
      }
    });
    return map;
  },

  // ============================================================
  // ALL RULES FETCHER
  // Returns all exception rules from Geotab (not just predefined ones)
  // ============================================================

  /**
   * Fetch all exception rules and return enriched rule objects.
   * Includes built-in Geotab rules and any custom rules configured
   * in the database.
   */
  async getAllRulesEnriched() {
    const rules = await this.getRules();
    return rules.map(r => ({
      id:         r.id,
      name:       r.name || 'Unnamed Rule',
      ruleType:   r.ruleType || '',
      baseType:   r.baseType || '',
      isCamera:   this._isCameraRule(r),
      isSpeeding: (r.name || '').toLowerCase().includes('speed'),
      isBuiltIn:  (r.id || '').startsWith('geotab.'),
    }));
  },

  /**
   * Detect if a rule is camera-based (AI vision events).
   */
  _isCameraRule(rule) {
    const name = (rule.name || '').toLowerCase();
    const id   = (rule.id   || '').toLowerCase();
    const CAMERA_KEYWORDS = [
      'cell phone', 'distracted', 'food', 'drink', 'tailgating',
      'lane departure', 'smoking', 'camera', 'surfsight', 'seatbelt forward',
      'drowsy', 'yawning', 'phone use', 'device button'
    ];
    return CAMERA_KEYWORDS.some(kw => name.includes(kw)) ||
           id.includes('apn') || id.includes('a91') || id.includes('ay7') ||
           id.includes('alx');
  },

  /**
   * Get exception event counts grouped by rule for a set of entities.
   * Returns: { ruleId: { name, count, isCamera, entityBreakdown: { entityId: count } } }
   */
  countEventsByRule(events, ruleObjects, groupByDriver = true) {
    const ruleMap = {};
    ruleObjects.forEach(r => {
      ruleMap[r.id] = { ...r, count: 0, entityBreakdown: {} };
    });

    events.forEach(evt => {
      const ruleId   = evt.rule?.id;
      const entityId = groupByDriver
        ? (evt.driver?.id || 'unknown')
        : (evt.device?.id || 'unknown');

      if (ruleId && ruleMap[ruleId]) {
        ruleMap[ruleId].count++;
        ruleMap[ruleId].entityBreakdown[entityId] =
          (ruleMap[ruleId].entityBreakdown[entityId] || 0) + 1;
      }
    });

    return ruleMap;
  },
};

window.GeotabAPI = GeotabAPI;

