import '../dropzone.css';

import { useState, type DragEvent } from 'react';

const SUPPORTED_EXTENSIONS = [
	'.docx',
	'.docm',
	'.dotx',
	'.rtf',
	'.odt',
	'.md',
	'.markdown',
	'.txt',
	'.json',
	'.docjson',
	'.png',
	'.jpg',
	'.jpeg',
	'.bmp',
	'.gif',
	'.webp',
];

const isSupported = (file: File) => SUPPORTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension));

export type UploadResult = {
	buffer: ArrayBuffer;
	fileName: string;
};

export type UploadProps = {
	setUploadResult: (result: UploadResult) => void;
	importError?: string | null;
};

export function Upload(props: UploadProps) {
	const [unsupportedFile, setUnsupportedFile] = useState(false);
	const [dragActive, setDragActive] = useState(false);

	const acceptFile = async (file: File | undefined) => {
		if (!file || !isSupported(file)) {
			setUnsupportedFile(true);
			return;
		}
		setUnsupportedFile(false);
		props.setUploadResult({ buffer: await file.arrayBuffer(), fileName: file.name });
	};

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		setDragActive(false);
		void acceptFile(event.dataTransfer.files[0]);
	};

	const errorText = unsupportedFile ? 'Unsupported file format' : props.importError;

	return (
		<div style={{ margin: 'auto' }}>
			<label
				className="dropzone-wrapper"
				onDragOver={(event) => {
					event.preventDefault();
					setDragActive(true);
				}}
				onDragLeave={() => setDragActive(false)}
				onDrop={onDrop}
			>
				<input
					type="file"
					accept={SUPPORTED_EXTENSIONS.join(',')}
					style={{ display: 'none' }}
					onChange={(event) => void acceptFile(event.target.files?.[0])}
				/>
				<p>{dragActive ? 'Drop the file here ...' : 'Drag and drop a document here (or click to select it)'}</p>
				{errorText ? (
					<div className="errorDiv">
						<p>{errorText}</p>
					</div>
				) : null}
			</label>
			<div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: '#888', lineHeight: 1.6 }}>
				<div>
					<strong style={{ color: '#666' }}>Documents:</strong> DOCX, DOTX, DOCM, RTF, ODT
				</div>
				<div>
					<strong style={{ color: '#666' }}>Text:</strong> Markdown, TXT, DocJSON
				</div>
				<div>
					<strong style={{ color: '#666' }}>Images:</strong> PNG, JPEG, BMP, GIF, WebP
				</div>
			</div>
		</div>
	);
}
