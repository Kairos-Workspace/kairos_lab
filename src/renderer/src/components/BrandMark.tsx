import { PRODUCT_NAME } from '@shared/constants'
import mark from '../assets/quantify-mark.png'

export function BrandMark({ subtitle }: { subtitle: string }): React.JSX.Element {
  return (
    <div className="brand-lockup">
      <img className="brand-mark" src={mark} alt="" width={40} height={40} />
      <div>
        <em>{PRODUCT_NAME}</em>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}
