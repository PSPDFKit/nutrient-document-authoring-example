import { AiAssistantPanel, type AssistantMessage } from './AssistantShell';

export type LegalAssistantShortcut = {
	label: string;
	prompt: string;
};

const SHORTCUT_GROUPS: readonly { heading: string; shortcuts: readonly LegalAssistantShortcut[] }[] = [
	{
		heading: 'Ask about the draft',
		shortcuts: [
			{
				label: 'Find blanks to finish',
				prompt:
					'List every bracketed blank, checkbox, and optional Cover Page item that must be completed before this Common Paper Mutual NDA is signed. Explain what decision each one needs.',
			},
			{
				label: 'Review term choices',
				prompt:
					'Review the selected MNDA Term and Term of Confidentiality. Explain whether the one-year defaults are enough for product plans, pricing, security materials, and trade secrets.',
			},
			{
				label: 'Check who can see info',
				prompt:
					'Explain who may receive Confidential Information under the Standard Terms. Flag whether affiliates, outside counsel, investors, auditors, or prospective acquirers are clearly covered.',
			},
		],
	},
	{
		heading: 'Revise the draft',
		shortcuts: [
			{ label: 'Fill effective date', prompt: 'Set the Cover Page effective date to June 25, 2026.' },
			{
				label: 'Set 3-year protection',
				prompt:
					'Update the Term of Confidentiality to three years from the date of last disclosure, while keeping the trade secret protection language.',
			},
			{
				label: 'Add affiliate access',
				prompt:
					'Add a Cover Page change allowing disclosure to controlled affiliates that need to know for the Purpose, if they are bound by confidentiality obligations at least as protective as this MNDA.',
			},
		],
	},
];

export type LegalAssistantPanelProps = {
	messages: readonly AssistantMessage[];
	input: string;
	onInputChange: (value: string) => void;
	reviewComments: boolean;
	onReviewCommentsChange: (enabled: boolean) => void;
	onSubmit: () => void;
	onShortcut: (shortcut: LegalAssistantShortcut) => void;
	busy: boolean;
	busyText?: string;
	errorText?: string;
};

export const LegalAssistantPanel = (props: LegalAssistantPanelProps) => {
	return (
		<>
			{props.messages.length === 0 ? (
				<div className="legal-assistant-shortcuts" aria-label="Sample legal prompts">
					{SHORTCUT_GROUPS.map((group) => (
						<div key={group.heading} className="legal-assistant-shortcut-group">
							<h3>{group.heading}</h3>
							<div className="legal-assistant-shortcut-buttons">
								{group.shortcuts.map((shortcut) => (
									<button key={shortcut.label} type="button" disabled={props.busy} onClick={() => props.onShortcut(shortcut)}>
										{shortcut.label}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			) : null}
			<AiAssistantPanel {...props} placeholder="What do you want to do to the contract?" />
		</>
	);
};
