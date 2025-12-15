import { describe, it, expect } from 'vitest'
import { api } from '../../lib/api'

describe('API Client', () => {
  describe('Spools', () => {
    it('should list spools', async () => {
      const spools = await api.listSpools()
      expect(spools).toBeInstanceOf(Array)
      expect(spools.length).toBe(2)
      expect(spools[0].material).toBe('PLA')
    })

    it('should get a single spool', async () => {
      const spool = await api.getSpool('spool-1')
      expect(spool.id).toBe('spool-1')
      expect(spool.material).toBe('PLA')
    })

    it('should create a spool', async () => {
      const newSpool = await api.createSpool({
        material: 'ABS',
        color_name: 'Blue',
        brand: 'Test Brand',
      })
      expect(newSpool.material).toBe('ABS')
      expect(newSpool.color_name).toBe('Blue')
      expect(newSpool.id).toBeDefined()
    })

    it('should update a spool', async () => {
      const updatedSpool = await api.updateSpool('spool-1', {
        material: 'PLA',
        color_name: 'White',
      })
      expect(updatedSpool.color_name).toBe('White')
    })
  })

  describe('Printers', () => {
    it('should list printers', async () => {
      const printers = await api.listPrinters()
      expect(printers).toBeInstanceOf(Array)
      expect(printers.length).toBe(1)
      expect(printers[0].name).toBe('X1 Carbon')
    })

    it('should get a single printer', async () => {
      const printer = await api.getPrinter('00M09A123456789')
      expect(printer.serial).toBe('00M09A123456789')
      expect(printer.model).toBe('X1C')
    })

    it('should get calibrations for a printer', async () => {
      const calibrations = await api.getCalibrations('00M09A123456789')
      expect(calibrations).toBeInstanceOf(Array)
    })
  })

  describe('Updates', () => {
    it('should get version info', async () => {
      const version = await api.getVersion()
      expect(version.version).toBe('0.1.0')
      expect(version.git_commit).toBe('abc1234')
      expect(version.git_branch).toBe('main')
    })

    it('should check for updates', async () => {
      const check = await api.checkForUpdates()
      expect(check.current_version).toBe('0.1.0')
      expect(check.update_available).toBe(false)
    })

    it('should get update status', async () => {
      const status = await api.getUpdateStatus()
      expect(status.status).toBe('idle')
    })

    it('should reset update status', async () => {
      const status = await api.resetUpdateStatus()
      expect(status.status).toBe('idle')
    })
  })

  describe('Cloud', () => {
    it('should get cloud status', async () => {
      const status = await api.getCloudStatus()
      expect(status.is_authenticated).toBe(false)
      expect(status.email).toBeNull()
    })

    it('should initiate cloud login', async () => {
      const result = await api.cloudLogin('test@example.com', 'password')
      expect(result.needs_verification).toBe(true)
    })

    it('should verify cloud login', async () => {
      const result = await api.cloudVerify('test@example.com', '123456')
      expect(result.success).toBe(true)
    })

    it('should logout from cloud', async () => {
      // Should not throw
      await api.cloudLogout()
    })

    it('should get slicer settings', async () => {
      const settings = await api.getSlicerSettings()
      expect(settings.filament).toBeInstanceOf(Array)
      expect(settings.printer).toBeInstanceOf(Array)
      expect(settings.process).toBeInstanceOf(Array)
    })
  })
})
