import { useId } from 'react';
import { AssistantStatus } from './AssistantShell';

type FocusedPanelStatusProps = { busy: boolean; busyText?: string; errorText?: string; statusText?: string };

export const ProofreadingPanel = (props: FocusedPanelStatusProps & { onReview: () => void; selectionScope?: string }) => (
	<div className="assistant-controls">
		{props.selectionScope ? <p className="assistant-scope">Scope: {props.selectionScope}</p> : null}
		<button type="button" className="assistant-action" disabled={props.busy} onClick={props.onReview}>
			{props.selectionScope ? 'Review Selection' : 'Review Document'}
		</button>
		<AssistantStatus {...props} />
	</div>
);

export type LanguageOption = { value: string; label: string };

export const TranslationPanel = (
	props: FocusedPanelStatusProps & {
		languageOptions: readonly LanguageOption[];
		targetLanguage: string;
		onTargetLanguageChange: (value: string) => void;
		instructions: string;
		onInstructionsChange: (value: string) => void;
		onTranslate: () => void;
		selectionScope?: string;
	},
) => {
	const languageId = useId();
	const instructionsId = useId();
	return (
		<div className="assistant-controls">
			{props.selectionScope ? <p className="assistant-scope">Scope: {props.selectionScope}</p> : null}
			<div className="assistant-field">
				<label htmlFor={languageId}>Target language</label>
				<select
					id={languageId}
					value={props.targetLanguage}
					disabled={props.busy}
					onChange={(event) => props.onTargetLanguageChange(event.target.value)}
				>
					{props.languageOptions.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<div className="assistant-field">
				<label htmlFor={instructionsId}>Translation instructions</label>
				<textarea
					id={instructionsId}
					rows={3}
					value={props.instructions}
					disabled={props.busy}
					placeholder="Optional: tone, audience, terms to keep untranslated…"
					onChange={(event) => props.onInstructionsChange(event.target.value)}
				/>
			</div>
			<button type="button" className="assistant-action" disabled={props.busy} onClick={props.onTranslate}>
				{props.selectionScope ? 'Translate Selection' : 'Translate Document'}
			</button>
			<AssistantStatus {...props} />
		</div>
	);
};

export type PlaceholderFieldGroup = {
	heading: string;
	fields: readonly { id: string; label: string; description?: string }[];
};

export const TemplateBuilderPanel = (
	props: FocusedPanelStatusProps & { onBuildTemplate: () => void; placeholderGroups: readonly PlaceholderFieldGroup[] },
) => (
	<>
		<div className="assistant-controls">
			<button type="button" className="assistant-action" disabled={props.busy} onClick={props.onBuildTemplate}>
				Build Template
			</button>
			<AssistantStatus {...props} />
		</div>
		<section className="assistant-catalog" aria-label="Placeholder catalog">
			{props.placeholderGroups.map((group) => (
				<div key={group.heading} className="assistant-catalog-group">
					<h3>{group.heading}</h3>
					<div className="assistant-catalog-fields">
						{group.fields.map((field) => (
							<span key={field.id} className="assistant-catalog-item">
								{field.label}
								{field.description ? <small>{field.description}</small> : null}
							</span>
						))}
					</div>
				</div>
			))}
		</section>
	</>
);
