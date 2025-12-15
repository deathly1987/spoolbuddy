import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { ProgressBar, WeightProgress } from '../../components/inventory/ProgressBar'

describe('ProgressBar Component', () => {
  it('renders progress bar', () => {
    render(<ProgressBar percent={50} />)
    // Check that progress-bar element exists
    const progressBar = document.querySelector('.progress-bar')
    expect(progressBar).toBeInTheDocument()
  })

  it('clamps percent to valid range', () => {
    render(<ProgressBar percent={150} showLabel />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clamps negative percent to 0', () => {
    render(<ProgressBar percent={-50} showLabel />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows label when showLabel is true', () => {
    render(<ProgressBar percent={75} showLabel />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('hides label when showLabel is false', () => {
    render(<ProgressBar percent={75} />)
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })

  it('uses custom label when provided', () => {
    render(<ProgressBar percent={50} showLabel label="Custom Label" />)
    expect(screen.getByText('Custom Label')).toBeInTheDocument()
  })

  it('applies high level class for > 50%', () => {
    render(<ProgressBar percent={75} />)
    const fill = document.querySelector('.progress-fill')
    expect(fill).toHaveClass('high')
  })

  it('applies medium level class for 21-50%', () => {
    render(<ProgressBar percent={35} />)
    const fill = document.querySelector('.progress-fill')
    expect(fill).toHaveClass('medium')
  })

  it('applies low level class for <= 20%', () => {
    render(<ProgressBar percent={15} />)
    const fill = document.querySelector('.progress-fill')
    expect(fill).toHaveClass('low')
  })

  it('applies correct width style', () => {
    render(<ProgressBar percent={60} />)
    const fill = document.querySelector('.progress-fill')
    expect(fill).toHaveStyle({ width: '60%' })
  })

  it('applies size class correctly', () => {
    render(<ProgressBar percent={50} size="lg" />)
    const bar = document.querySelector('.progress-bar')
    expect(bar).toHaveClass('h-3')
  })
})

describe('WeightProgress Component', () => {
  it('calculates percent from remaining and total', () => {
    render(<WeightProgress remaining={500} total={1000} />)
    // Should show 500g label (50% of 1000)
    expect(screen.getByText('500g')).toBeInTheDocument()
  })

  it('handles zero total gracefully', () => {
    render(<WeightProgress remaining={100} total={0} />)
    expect(screen.getByText('100g')).toBeInTheDocument()
  })

  it('shows percentage when showWeight is false', () => {
    render(<WeightProgress remaining={500} total={1000} showWeight={false} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('rounds weight display', () => {
    render(<WeightProgress remaining={123.456} total={1000} />)
    expect(screen.getByText('123g')).toBeInTheDocument()
  })

  it('applies size prop to progress bar', () => {
    render(<WeightProgress remaining={500} total={1000} size="sm" />)
    const bar = document.querySelector('.progress-bar')
    expect(bar).toHaveClass('h-1.5')
  })
})
