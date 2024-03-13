import Link from "next/link";
import { Button } from "@/components/button";

interface PaginationButtonProps {
    disabled: boolean;
    href: string;
    ariaLabel: string;
    IconComponent: React.ElementType;
}

export const PaginationButton: React.FC<PaginationButtonProps> = ({
    disabled,
    href,
    ariaLabel,
    IconComponent,
}) => (
    <Link aria-disabled={disabled} className={disabled ? "pointer-events-none" : ""} href={href}>
        <Button disabled={disabled} variant="outline" className="h-8 w-8 p-0">
            <span className="sr-only">{ariaLabel}</span>
            <IconComponent className="h-4 w-4" />
        </Button>
    </Link>
);