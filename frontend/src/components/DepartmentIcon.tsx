import { BankIcon, ChartIcon, FileTextIcon, GraduationCapIcon, UmbrellaIcon, WalletIcon } from "./icons";

const ICONS: Record<string, typeof BankIcon> = {
  banking: BankIcon,
  education: GraduationCapIcon,
  insurance: UmbrellaIcon,
  microfinance: WalletIcon,
  payments: FileTextIcon,
  markets: ChartIcon,
};

/** The department's icon, the same wherever an assessment is shown. */
export default function DepartmentIcon({ departmentKey, size }: { departmentKey: string; size: number }) {
  const Icon = ICONS[departmentKey] ?? BankIcon;
  return <Icon size={size} />;
}
