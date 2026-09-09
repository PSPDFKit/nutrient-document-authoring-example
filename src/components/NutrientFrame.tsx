import { useState, type PropsWithChildren } from 'react';
import { ExamplesMenu, type ExampleLink } from './ExamplesMenu';

const SUPPORTED_FORMATS = 'Supported: DOCX, DOTX, DOCM, RTF, ODT, Markdown, TXT, DocJSON, PNG, JPEG, BMP, GIF, WebP';

export type NavLink = {
	id: 'blank' | 'upload';
	label: string;
	href: string;
};

const NAV_LINK_BLANK: NavLink = { id: 'blank', label: 'Blank Page', href: '/blank/' };
const NAV_LINK_UPLOAD: NavLink = { id: 'upload', label: 'Upload Document', href: '/upload/' };
const SOURCE_URL = 'https://github.com/PSPDFKit/nutrient-document-authoring-example';

const InfoBadge = () => {
	const [hovered, setHovered] = useState(false);

	return (
		<span
			style={{ position: 'relative', marginLeft: '-0.75rem', display: 'inline-flex', alignItems: 'center' }}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<span
				style={{
					cursor: 'help',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '16px',
					height: '16px',
					borderRadius: '50%',
					border: `1.5px solid ${hovered ? '#555' : '#888'}`,
					fontSize: '10px',
					fontWeight: 600,
					color: hovered ? '#555' : '#888',
					background: hovered ? '#eee' : 'transparent',
					lineHeight: 1,
					userSelect: 'none',
				}}
			>
				?
			</span>
			{hovered && (
				<span
					style={{
						position: 'absolute',
						top: '100%',
						left: '50%',
						transform: 'translateX(-50%)',
						marginTop: '4px',
						padding: '6px 10px',
						background: '#333',
						color: '#fff',
						fontSize: '0.65rem',
						borderRadius: '4px',
						whiteSpace: 'nowrap',
						zIndex: 1000,
						pointerEvents: 'none',
					}}
				>
					{SUPPORTED_FORMATS}
				</span>
			)}
		</span>
	);
};

export type NutrientFrameProps = PropsWithChildren<{
	/** Highlights the matching top-navigation entry with aria-current. */
	activeNavId?: 'blank' | 'examples' | 'upload';
	/** Highlights the matching entry inside the Examples menu. */
	activeExampleId?: string;
	/** Call event.preventDefault() to take over navigation (for example, client-side routing). */
	onNavigate?: (target: NavLink | ExampleLink, event: React.MouseEvent<HTMLAnchorElement>) => void;
	embedded?: boolean;
	showViewSource?: boolean;
	navigationDisabled?: boolean;
}>;

const NavAnchor = (props: { link: NavLink; active: boolean; disabled?: boolean; onNavigate?: NutrientFrameProps['onNavigate'] }) => (
	<a
		href={props.link.href}
		className="link nav-link"
		aria-current={props.active ? 'page' : undefined}
		aria-disabled={props.disabled || undefined}
		onClick={(event) => {
			if (props.disabled) {
				event.preventDefault();
				return;
			}
			props.onNavigate?.(props.link, event);
		}}
	>
		<span>{props.link.label}</span>
	</a>
);

const ViewSource = (props: { compact?: boolean }) => (
	<a
		href={SOURCE_URL}
		target="_blank"
		rel="noopener noreferrer"
		className={props.compact ? 'view-source view-source-compact' : 'view-source nav-link'}
	>
		View source
	</a>
);

export const NutrientFrame = (props: NutrientFrameProps) => {
	return (
		<div className="app-frame" style={{ display: 'flex', flexFlow: 'column', height: '100%' }}>
			{props.embedded ? (
				<div className="embed-toolbar" aria-label="Embedded document controls">
					<span>Document Authoring</span>
					{props.showViewSource !== false ? <ViewSource compact /> : null}
				</div>
			) : (
				<div className="app-header">
					<menu>
						<div style={{ display: 'flex', color: 'rgb(31 41 55)', alignItems: 'center' }}>
							<a
								href="https://nutrient.io"
								target="_blank"
								rel="noopener noreferrer"
								style={{ height: '2rem', display: 'flex', color: 'inherit', textDecoration: 'inherit', alignItems: 'center' }}
							>
								<div style={{ display: 'flex' }}>
									<img src="/icons/logo.svg" width="148px" height="44px" alt="Nutrient Logotype" />
								</div>
							</a>
							<div className="links">
								<div style={{ marginRight: '1rem' }} />
								<NavAnchor
									link={NAV_LINK_BLANK}
									active={props.activeNavId === 'blank'}
									disabled={props.navigationDisabled}
									onNavigate={props.onNavigate}
								/>
								<ExamplesMenu
									activeExampleId={props.activeNavId === 'examples' ? props.activeExampleId : undefined}
									disabled={props.navigationDisabled}
									onSelect={props.onNavigate}
								/>
								<NavAnchor
									link={NAV_LINK_UPLOAD}
									active={props.activeNavId === 'upload'}
									disabled={props.navigationDisabled}
									onNavigate={props.onNavigate}
								/>
								<InfoBadge />
							</div>
						</div>
						<div className="header-actions">
							<div className="document-controls" aria-label="Document controls">
								<ViewSource />
							</div>
							<div className="marketing-controls">
								<a href="https://nutrient.io/sdk/document-authoring/" target="_blank" rel="noreferrer" className="learn-more nav-link">
									<span>Learn More</span>
								</a>
								<a href="https://nutrient.io/contact-sales/" target="_blank" rel="noreferrer" className="contact-sales nav-link">
									<span>Contact Sales</span>
								</a>
							</div>
						</div>
					</menu>
				</div>
			)}

			<div id="app-content" className="app-content" style={{ flex: '1' }}>
				{props.children}
			</div>
		</div>
	);
};
