import React from 'react';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { updateClinicalDetails } from '../../../controllers/slices/patientVisitSlice';
import { UploadService } from '../../../services/uploadService';
import { Card, Input, Button } from '../../components/UI';
import { Camera, FileUp, History as HistoryIcon, Table } from 'lucide-react';

export const ClinicalTab: React.FC = () => {
    const dispatch = useAppDispatch();
    const { clinical, patientId, isVisitLocked } = useAppSelector((state) => state.patientVisit);

    const handleVitalsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        dispatch(updateClinicalDetails({
            vitals: { ...clinical.vitals, [name]: value }
        }));
    };

    const handleHistoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        let value = e.target.value;
        // Auto-bullet logic: if line doesn't start with • and isn't empty, prepend it
        const lines = value.split('\n');
        const bulletedLines = lines.map(line => {
            if (line.trim() && !line.trim().startsWith('•')) {
                return `• ${line.trim()}`;
            }
            return line;
        });

        dispatch(updateClinicalDetails({ historyText: bulletedLines.join('\n') }));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !patientId) return;

        try {
            const result = await UploadService.performCompleteUpload(patientId, file, 'Report');
            dispatch(updateClinicalDetails({
                reports: [...clinical.reports, {
                    ...result,
                    fileSize: file.size,
                    category: 'Report',
                    timestamp: new Date().toISOString()
                }]
            }));
            alert('File uploaded successfully!');
        } catch (error) {
            alert('Upload failed. Please check CORS or AWS credentials.');
        }
    };

    const vitalsFields = [
        { name: 'inr', label: 'INR' },
        { name: 'hb', label: 'Hb' },
        { name: 'wbc', label: 'WBC' },
        { name: 'platelet', label: 'Platelet' },
        { name: 'bilirubin', label: 'Bilirubin' },
        { name: 'sgot', label: 'SGOT' },
        { name: 'sgpt', label: 'SGPT' },
        { name: 'alt', label: 'ALT' },
        { name: 'tprAlb', label: 'TPR/Alb' },
        { name: 'ureaCreat', label: 'Urea/Creat' },
        { name: 'sodium', label: 'Sodium' },
        { name: 'fastingHbA1c', label: 'Fasting/HbA1c' },
        { name: 'pp', label: 'PP' },
        { name: 'tsh', label: 'TSH' },
        { name: 'ft4', label: 'FT4' },
    ];

    return (
        <div className="space-y-6">
            <Card title="History & Symptoms">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-type-heading">Complaints (Auto-Bulleted)</label>
                    <Button variant="secondary" className="text-xs py-1 h-auto flex gap-1">
                        <HistoryIcon size={14} /> View History
                    </Button>
                </div>
                <textarea
                    value={clinical.historyText}
                    onChange={handleHistoryChange}
                    disabled={isVisitLocked}
                    className="input-field min-h-[150px] font-mono text-sm"
                    placeholder="Start typing symptoms... each new line will be bulleted."
                />
            </Card>

            <Card title="Clinical Vitals">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-type-body">Enter vital parameters from reports</p>
                    <Button variant="secondary" className="text-xs py-1 h-auto flex gap-1">
                        <Table size={14} /> Compare Table
                    </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {vitalsFields.map((field) => (
                        <Input
                            key={field.name}
                            label={field.label}
                            name={field.name}
                            value={clinical.vitals[field.name] || ''}
                            onChange={handleVitalsChange}
                            disabled={isVisitLocked}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                        />
                    ))}
                </div>
            </Card>

            <Card title="Reports & Documents">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-borderColor rounded-lg p-8 bg-gray-50">
                    <FileUp size={48} className="text-type-body mb-4" />
                    <p className="text-type-heading font-medium mb-1">Upload Patient Reports</p>
                    <p className="text-sm text-type-body mb-4">Camera, Gallery, or Documents (PDF, JPG, PNG)</p>
                    <input
                        type="file"
                        id="report-upload"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isVisitLocked || !patientId}
                    />
                    <Button
                        variant="primary"
                        onClick={() => document.getElementById('report-upload')?.click()}
                        disabled={isVisitLocked || !patientId}
                        className="flex gap-2"
                    >
                        <Camera size={18} /> Select Files
                    </Button>
                    {!patientId && <p className="mt-2 text-xs text-status-error font-medium">Please fill Basic info first to enable uploads</p>}
                </div>

                {clinical.reports.length > 0 && (
                    <div className="mt-6">
                        <h4 className="font-semibold text-type-heading mb-3">Recent Uploads</h4>
                        <div className="space-y-2">
                            {clinical.reports.map((report, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-white border border-borderColor rounded-md shadow-tier-light">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-light rounded text-primary-base">
                                            <FileText size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-type-heading">{report.fileName}</p>
                                            <p className="text-xs text-type-body">{(report.fileSize / 1024).toFixed(1)} KB • {report.category}</p>
                                        </div>
                                    </div>
                                    <Button variant="secondary" className="text-xs py-1 h-auto">View</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

// Re-importing FileText since it was used but not imported
import { FileText } from 'lucide-react';
