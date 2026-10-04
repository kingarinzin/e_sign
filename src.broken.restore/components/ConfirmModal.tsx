"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`${isDangerous ? 'bg-red-100' : 'bg-yellow-100'} rounded-full p-3`}>
            <AlertTriangle className={`${isDangerous ? 'text-red-600' : 'text-yellow-600'}`} size={48} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-3">
          {title}
        </h2>

        {/* Message */}
        <p className="text-center text-gray-600 mb-6 whitespace-pre-line">
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-lg font-semibold transition cursor-pointer ${
              isDangerous
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
