import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { Badge, PrinterBadge, LowStockBadge, KBadge, OriginBadge, EncodedBadge } from '../../components/inventory/Badge'

describe('Badge Component', () => {
  it('renders children correctly', () => {
    render(<Badge>Test Content</Badge>)
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('applies default variant class', () => {
    render(<Badge>Default</Badge>)
    const badge = screen.getByText('Default')
    expect(badge).toHaveClass('badge')
    expect(badge).not.toHaveClass('badge-default')
  })

  it('applies variant class correctly', () => {
    render(<Badge variant="low">Low Stock</Badge>)
    const badge = screen.getByText('Low Stock')
    expect(badge).toHaveClass('badge', 'badge-low')
  })

  it('applies additional class names', () => {
    render(<Badge class="custom-class">Custom</Badge>)
    const badge = screen.getByText('Custom')
    expect(badge).toHaveClass('custom-class')
  })
})

describe('PrinterBadge Component', () => {
  it('renders printer location', () => {
    render(<PrinterBadge location="X1 Carbon" />)
    expect(screen.getByText('X1 Carbon')).toBeInTheDocument()
  })

  it('returns null for empty location', () => {
    const { container } = render(<PrinterBadge location="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LowStockBadge Component', () => {
  it('renders Low text', () => {
    render(<LowStockBadge />)
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('has low variant styling', () => {
    render(<LowStockBadge />)
    const badge = screen.getByText('Low')
    expect(badge).toHaveClass('badge-low')
  })
})

describe('KBadge Component', () => {
  it('renders K text', () => {
    render(<KBadge />)
    expect(screen.getByText('K')).toBeInTheDocument()
  })

  it('has k variant styling', () => {
    render(<KBadge />)
    const badge = screen.getByText('K')
    expect(badge).toHaveClass('badge-k')
  })
})

describe('OriginBadge Component', () => {
  it('renders origin text', () => {
    render(<OriginBadge origin="Bambu Lab" />)
    expect(screen.getByText('Bambu Lab')).toBeInTheDocument()
  })

  it('applies origin variant for Bambu origins', () => {
    render(<OriginBadge origin="Bambu Lab" />)
    const badge = screen.getByText('Bambu Lab')
    expect(badge).toHaveClass('badge-origin')
  })

  it('applies manual variant for non-Bambu origins', () => {
    render(<OriginBadge origin="Generic" />)
    const badge = screen.getByText('Generic')
    expect(badge).toHaveClass('badge-manual')
  })

  it('returns null for empty origin', () => {
    const { container } = render(<OriginBadge origin="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('EncodedBadge Component', () => {
  it('renders NFC text when encoded is true', () => {
    render(<EncodedBadge encoded={true} />)
    expect(screen.getByText('NFC')).toBeInTheDocument()
  })

  it('returns null when encoded is false', () => {
    const { container } = render(<EncodedBadge encoded={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
