import { PRODUCT_NAME } from '@shared/constants'

export function BrandMark({ subtitle }: { subtitle: string }): React.JSX.Element {
  return (
    <div className="brand-lockup">
      <div>
        <em>{PRODUCT_NAME}</em>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}
