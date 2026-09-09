import type { DocAuthDocument, DocAuthEditor, DocAuthSystem } from '@nutrient-sdk/document-authoring';
import { createDocAuthSystem } from '@nutrient-sdk/document-authoring';
import { useEffect, useRef } from 'react';

const LICENSE_KEYS: Record<string, string> = {
	'document-authoring-demo.nutrient.io':
		'hFt1bpHpLvRT8sfsVZb7YV_zJ0YxuK32-mUGfD7FMnllC-n29d8LvMBcTBi3nscPqL8VSvLfJLQpxQetJK0BDXmiJKOafUay0K0zuiw1qj4Kbqn2lSOzes3flFRVxc1o-ZfQd-9anukyj_Egn43FSHaoNOXFthnT5YWKniA1x53WlKB1E5AER225lGgTuPxO7Z88qVi5JvuYwJPkt1miVoBQ5nkx7CVtRYyKfsGhyG3_6jR2eLzPGfjg77gSkOz_cpacEFT1VxrE5vO0eCHHFT7-AkQZIE9UI6VzQwA',
	'document-authoring-demo.pspdfkit.com':
		'Mj1q_pYiPFmoDp2bTy8t6STyMVKQaU4K-4jVFhsNNAafDiHPX6-CoLdNlQVmrni1ITVeQRVAqzdAbjZRFX3pAXmiJKOafUay0K0zuiw1qj5jhdBONjZ-_5KPK1c8mDQv-ZfQd-9anukyj_Egn43FSHaoNOXFthnT5YWKniA1x52XjXEm5cha1IthLxEScYEyNeR-FpDbQCzGqSnG65BrUrj1v0gVPJrQL-ddOYjM3relpRz5ZwXq0YAQzTm1PpoXzm2L53-Jk5qUA80OuU7VUHKsgidMS3DTHCN0cXTW',
	'document-authoring-demo.vercel.app':
		'kJBYVPmkn7eEpFmBKbgw2GPFNyTmq0RywQfJDtIBWp95DST4j-LeYztdOCwVpb6C-QBRt1JBtpWFUc8rGQ3yCnmiJKOafUay0K0zuiw1qj6nEsGWJV5UuH0ym43tRk7i-ZfQd-9anukyj_Egn43FSHaoNOXFthnT5YWKniA1x528aJN9Ce17Po9b_BfodgXqmobgER7cOux8U3Y-Iom5fSKyGo4clouW5tvAX5G3ECzgLFxVgQlpXHFlTd6sFFxogaJn5MqBin2eQ9clIUA12FmfGiu9V2vBtilVxg',
};

export type DocAuthProps = {
	initialDocument: (system: DocAuthSystem) => Promise<DocAuthDocument>;
	onEditorReady: (editor: DocAuthEditor) => void;
	onImportError: (error: unknown) => void;
};

export const DocAuth = (props: DocAuthProps) => {
	const ref = useRef<HTMLDivElement>(null);
	const propsRef = useRef(props);
	propsRef.current = props;

	useEffect(() => {
		const target = ref.current;
		if (!target) return;

		let cancelled = false;
		let editor: DocAuthEditor | undefined;
		let system: DocAuthSystem | undefined;

		const init = async () => {
			try {
				system = await createDocAuthSystem({
					licenseKey: LICENSE_KEYS[window.location.hostname],
				});
				const document = await propsRef.current.initialDocument(system);
				if (cancelled) return;
				editor = await system.createEditor(target, { document });
				propsRef.current.onEditorReady(editor);
			} catch (error) {
				if (!cancelled) propsRef.current.onImportError(error);
			}
		};

		void init();

		return () => {
			cancelled = true;
			editor?.destroy();
			system?.destroy();
			target.replaceChildren();
		};
	}, []);

	return <div ref={ref} data-testid="document-editor-host" className="document-editor-host" />;
};
