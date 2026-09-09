import { useEffect, useId, useRef, useState } from 'react';
import { EXAMPLE_EXPERIENCES } from '../lib/document-experiences';

export type ExampleLink = {
	id: string;
	label: string;
	href: string;
};

const EXAMPLE_LINKS: readonly ExampleLink[] = EXAMPLE_EXPERIENCES.map(({ id, label, path }) => ({
	id,
	label,
	href: path,
}));

export type ExamplesMenuProps = {
	activeExampleId?: string;
	disabled?: boolean;
	/** Call event.preventDefault() to take over navigation (for example, client-side routing). */
	onSelect?: (item: ExampleLink, event: React.MouseEvent<HTMLAnchorElement>) => void;
};

export const ExamplesMenu = (props: ExamplesMenuProps) => {
	const items = EXAMPLE_LINKS;
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
	const pendingFocusRef = useRef<number | null>(null);
	const menuId = useId();

	const focusItem = (index: number) => {
		itemRefs.current[(index + items.length) % items.length]?.focus();
	};

	useEffect(() => {
		if (open && pendingFocusRef.current !== null) {
			focusItem(pendingFocusRef.current);
			pendingFocusRef.current = null;
		}
	});

	useEffect(() => {
		if (props.disabled) setOpen(false);
	}, [props.disabled]);

	useEffect(() => {
		if (!open) return;
		const closeOnOutsidePress = (event: PointerEvent) => {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
				setOpen(false);
			}
		};
		document.addEventListener('pointerdown', closeOnOutsidePress);
		return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
	}, [open]);

	const openWithFocus = (index: number) => {
		if (props.disabled) return;
		pendingFocusRef.current = index;
		setOpen(true);
	};

	const handleButtonKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			openWithFocus(0);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			openWithFocus(items.length - 1);
		}
	};

	const handleMenuKeyDown = (event: React.KeyboardEvent) => {
		const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				focusItem(currentIndex + 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				focusItem(currentIndex - 1);
				break;
			case 'Home':
				event.preventDefault();
				focusItem(0);
				break;
			case 'End':
				event.preventDefault();
				focusItem(items.length - 1);
				break;
			case 'Escape':
				event.preventDefault();
				setOpen(false);
				buttonRef.current?.focus();
				break;
			case 'Tab':
				setOpen(false);
				break;
		}
	};

	const handleFocusOut = (event: React.FocusEvent) => {
		// relatedTarget is null on plain clicks in some browsers; outside clicks close via pointerdown.
		if (event.relatedTarget instanceof Node && !rootRef.current?.contains(event.relatedTarget)) {
			setOpen(false);
		}
	};

	return (
		<div ref={rootRef} className="examples-menu" onBlur={handleFocusOut}>
			<button
				ref={buttonRef}
				type="button"
				className="link nav-link examples-menu-button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				disabled={props.disabled}
				onClick={() => (open ? setOpen(false) : openWithFocus(0))}
				onKeyDown={handleButtonKeyDown}
			>
				<span>Examples</span>
				<svg className="examples-menu-caret" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
					<path
						d="M3.5 6l4.5 4.5L12.5 6"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{open ? (
				<div id={menuId} role="menu" aria-label="Examples" className="examples-menu-list" onKeyDown={handleMenuKeyDown}>
					{items.map((item, index) => (
						<a
							key={item.id}
							ref={(element) => {
								itemRefs.current[index] = element;
							}}
							role="menuitem"
							tabIndex={-1}
							className="examples-menu-item"
							href={item.href}
							aria-current={props.activeExampleId === item.id ? 'page' : undefined}
							onClick={(event) => {
								props.onSelect?.(item, event);
								setOpen(false);
								if (event.defaultPrevented) buttonRef.current?.focus();
							}}
						>
							{item.label}
						</a>
					))}
				</div>
			) : null}
		</div>
	);
};
