/**
 * api.js — Geotab API Wrapper
 * Caching, error handling, all entity calls
 *
 * NOTE: Get() caps at 500 records by default.
 * Bade datasets ke liye resultsLimit badao ya GetFeed use karo.
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
    // Geotab mein 'Driver' typeName kaam nahi karta
    // 'User' use karna hota hai isDriver: true ke saath
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

  groupEventsByDevice(events) {
    const map = {};
    events.forEach(evt => {
      const id = evt.device?.id || 'unknown';
      if (!map[id]) map[id] = [];
      map[id].push(evt);
    });
    return map;
  },

  groupEventsByDriver(events) {
    const map = {};
    events.forEach(evt => {
      const id = evt.driver?.id || 'unknown';
      if (!map[id]) map[id] = [];
      map[id].push(evt);
    });
    return map;
  },

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
    Object.keys(map).forEach(id => {
      map[id].daysDriven = map[id].days.size;
      delete map[id].days;
    });
    return map;
  },

  countOfflineDevices(deviceStatusList, days = 5) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return deviceStatusList.filter(ds => {
      if (!ds.lastCommunicationDate) return false;
      return new Date(ds.lastCommunicationDate) < cutoff;
    }).length;
  }
};

window.GeotabAPI = GeotabAPI;
