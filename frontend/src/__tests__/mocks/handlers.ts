import { http, HttpResponse } from 'msw'

// Sample test data
export const mockSpools = [
  {
    id: 'spool-1',
    tag_id: null,
    material: 'PLA',
    subtype: 'Basic',
    color_name: 'Black',
    rgba: '#000000FF',
    brand: 'Bambu Lab',
    label_weight: 1000,
    core_weight: 250,
    weight_new: 1000,
    weight_current: 850,
    slicer_filament: 'GFPL01',
    note: null,
    added_time: null,
    encode_time: null,
    added_full: false,
    consumed_since_add: 150,
    consumed_since_weight: 50,
    weight_used: 0,
    data_origin: null,
    tag_type: null,
    ext_has_k: false,
    created_at: 1702000000,
    updated_at: 1702000000,
  },
  {
    id: 'spool-2',
    tag_id: null,
    material: 'PETG',
    subtype: 'Basic',
    color_name: 'Red',
    rgba: '#FF0000FF',
    brand: 'Generic',
    label_weight: 1000,
    core_weight: 250,
    weight_new: 1000,
    weight_current: 1000,
    slicer_filament: null,
    note: 'Test spool',
    added_time: null,
    encode_time: null,
    added_full: true,
    consumed_since_add: 0,
    consumed_since_weight: 0,
    weight_used: 0,
    data_origin: null,
    tag_type: null,
    ext_has_k: false,
    created_at: 1702100000,
    updated_at: 1702100000,
  },
]

export const mockPrinters = [
  {
    serial: '00M09A123456789',
    name: 'X1 Carbon',
    model: 'X1C',
    ip_address: '192.168.1.100',
    access_code: '12345678',
    last_seen: 1702000000,
    config: null,
    auto_connect: true,
    connected: true,
  },
]

export const mockVersionInfo = {
  version: '0.1.0',
  git_commit: 'abc1234',
  git_branch: 'main',
}

export const mockUpdateCheck = {
  current_version: '0.1.0',
  latest_version: '0.1.0',
  update_available: false,
  release_notes: null,
  release_url: null,
  published_at: null,
  error: null,
}

export const mockCloudStatus = {
  is_authenticated: false,
  email: null,
}

// API handlers
export const handlers = [
  // Spools
  http.get('/api/spools', () => {
    return HttpResponse.json(mockSpools)
  }),

  http.get('/api/spools/:id', ({ params }) => {
    const spool = mockSpools.find(s => s.id === params.id)
    if (spool) {
      return HttpResponse.json(spool)
    }
    return new HttpResponse(null, { status: 404 })
  }),

  http.post('/api/spools', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const newSpool = {
      id: `spool-${Date.now()}`,
      tag_id: null,
      subtype: null,
      color_name: null,
      rgba: null,
      brand: null,
      label_weight: 1000,
      core_weight: 250,
      weight_new: null,
      weight_current: null,
      slicer_filament: null,
      note: null,
      added_time: null,
      encode_time: null,
      added_full: false,
      consumed_since_add: 0,
      consumed_since_weight: 0,
      weight_used: 0,
      data_origin: null,
      tag_type: null,
      ext_has_k: false,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      ...body,
    }
    return HttpResponse.json(newSpool)
  }),

  http.put('/api/spools/:id', async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>
    const spool = mockSpools.find(s => s.id === params.id)
    if (spool) {
      const updated = { ...spool, ...body, updated_at: Math.floor(Date.now() / 1000) }
      return HttpResponse.json(updated)
    }
    return new HttpResponse(null, { status: 404 })
  }),

  http.delete('/api/spools/:id', ({ params }) => {
    const index = mockSpools.findIndex(s => s.id === params.id)
    if (index !== -1) {
      return HttpResponse.json({ success: true })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // Printers
  http.get('/api/printers', () => {
    return HttpResponse.json(mockPrinters)
  }),

  http.get('/api/printers/:serial', ({ params }) => {
    const printer = mockPrinters.find(p => p.serial === params.serial)
    if (printer) {
      return HttpResponse.json(printer)
    }
    return new HttpResponse(null, { status: 404 })
  }),

  http.get('/api/printers/:serial/calibrations', () => {
    return HttpResponse.json([])
  }),

  // Updates
  http.get('/api/updates/version', () => {
    return HttpResponse.json(mockVersionInfo)
  }),

  http.get('/api/updates/check', () => {
    return HttpResponse.json(mockUpdateCheck)
  }),

  http.get('/api/updates/status', () => {
    return HttpResponse.json({ status: 'idle', message: null, progress: null, error: null })
  }),

  http.post('/api/updates/apply', () => {
    return HttpResponse.json({ status: 'checking', message: 'Starting update...', progress: null, error: null })
  }),

  http.post('/api/updates/reset-status', () => {
    return HttpResponse.json({ status: 'idle', message: null, progress: null, error: null })
  }),

  // Cloud
  http.get('/api/cloud/status', () => {
    return HttpResponse.json(mockCloudStatus)
  }),

  http.post('/api/cloud/login', () => {
    return HttpResponse.json({
      success: false,
      needs_verification: true,
      message: 'Verification code sent',
    })
  }),

  http.post('/api/cloud/verify', () => {
    return HttpResponse.json({
      success: true,
      needs_verification: false,
      message: 'Login successful',
    })
  }),

  http.post('/api/cloud/logout', () => {
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/cloud/settings', () => {
    return HttpResponse.json({
      filament: [],
      printer: [],
      process: [],
    })
  }),

  // Device
  http.get('/api/device/status', () => {
    return HttpResponse.json({
      connected: false,
      last_weight: null,
      weight_stable: false,
      current_tag_id: null,
    })
  }),

  http.post('/api/device/tare', () => {
    return HttpResponse.json({ success: true })
  }),
]
