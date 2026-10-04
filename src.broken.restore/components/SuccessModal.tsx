"use client";

import { useEffect } from "react";
import { CheckCircle, X } from "lucide-react";

interface SuccessModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  buttonText?: string;
  showButton?: boolean;
}

export default function SuccessModal({
  isOpen,
  title,
  message,
  onClose,
  buttonText = "OK",
  showButton = true,
}: SuccessModalProps) {
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
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="bg-green-100 rounded-full p-3">
            <CheckCircle className="text-green-600" size={48} />
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

        {/* Button */}
        {showButton && (
          <button
            onClick={onClose}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition cursor-pointer"
          >
            {buttonText}
          </button>
        )}
      </div>
    </div>
  );
}
