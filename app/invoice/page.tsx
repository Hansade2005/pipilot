'use client';

import { useState } from 'react';
import { Plus, Minus, Download, FileText } from 'lucide-react';
import { usePageTitle } from '@/hooks/use-page-title'

// Type declarations for CDN libraries
declare global {
  interface Window {
    jsPDF: any;
    html2canvas: any;
  }
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  // Company Information
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyState: string;
  companyZip: string;
  companyPhone: string;
  companyEmail: string;

  // Client Information
  clientName: string;
  clientAddress: string;
  clientCity: string;
  clientState: string;
  clientZip: string;
  clientPhone: string;
  clientEmail: string;

  // Invoice Details
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poNumber: string;

  // Items
  items: InvoiceItem[];

  // Financial
  taxRate: number;
  discount: number;
  notes: string;
}

export default function InvoicePage() {
  usePageTitle('Invoice Generator')
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    companyName: 'PiPilot',
    companyAddress: '123 Innovation Drive',
    companyCity: 'Tech Valley',
    companyState: 'CA',
    companyZip: '94043',
    companyPhone: '(555) 123-4567',
    companyEmail: 'billing@pipilot.dev',

    clientName: '',
    clientAddress: '',
    clientCity: '',
    clientState: '',
    clientZip: '',
    clientPhone: '',
    clientEmail: '',

    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    poNumber: '',

    items: [
      {
        id: '1',
        description: '',
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ],

    taxRate: 0,
    discount: 0,
    notes: 'Thank you for your business!',
  });

  const addItem = () => {
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0,
    };
    setInvoiceData(prev => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const removeItem = (id: string) => {
    setInvoiceData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
    }));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setInvoiceData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'rate') {
            updatedItem.amount = updatedItem.quantity * updatedItem.rate;
          }
          return updatedItem;
        }
        return item;
      }),
    }));
  };

  const calculateSubtotal = () => {
    return invoiceData.items.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateTax = () => {
    return (calculateSubtotal() * invoiceData.taxRate) / 100;
  }; 

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax() - invoiceData.discount;
  };

  const loadLibrary = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  };

  const downloadPDF = async () => {
    try {
      // Load jsPDF from CDN if not already loaded
      if (!window.jsPDF) {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }

      // Load html2canvas from CDN if not already loaded
      if (!window.html2canvas) {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }

      const { jsPDF } = window.jsPDF;
      const invoiceElement = document.getElementById('invoice-preview');

      if (!invoiceElement) {
        throw new Error('Invoice preview element not found');
      }

      if (!window.html2canvas) {
        throw new Error('html2canvas library failed to load');
      }

      // Generate canvas from invoice element
      const canvas = await window.html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: invoiceElement.scrollWidth,
        height: invoiceElement.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Save the PDF
      pdf.save(`invoice-${invoiceData.invoiceNumber}.pdf`);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(`Error generating PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-blue-600" />
            Professional Invoice Generator
          </h1>
          <p className="mt-2 text-gray-600">
            Create and download professional PDF invoices for your business
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Invoice Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Invoice Details</h2>

            <div className="space-y-6">
              {/* Company Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyName}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyPhone}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyPhone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyAddress}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyAddress: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyCity}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyCity: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyState}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyState: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={invoiceData.companyZip}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyZip: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={invoiceData.companyEmail}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, companyEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Client Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Client Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Name
                    </label>
                    <input
                      type="text"
                      value={invoiceData.clientName}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter client name"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={invoiceData.clientAddress}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientAddress: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter client address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={invoiceData.clientCity}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientCity: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={invoiceData.clientState}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientState: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={invoiceData.clientZip}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientZip: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={invoiceData.clientEmail}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, clientEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Invoice Details */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      value={invoiceData.invoiceNumber}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={invoiceData.invoiceDate}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, invoiceDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={invoiceData.dueDate}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      PO Number
                    </label>
                    <input
                      type="text"
                      value={invoiceData.poNumber}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, poNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Invoice Items</h3>
                  <button
                    onClick={addItem}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-4">
                  {invoiceData.items.map((item, index) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-5">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Item description"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rate
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Amount
                          </label>
                          <input
                            type="number"
                            value={item.amount.toFixed(2)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                          />
                        </div>
                        <div className="md:col-span-1 flex items-end">
                          {invoiceData.items.length > 1 && (
                            <button
                              onClick={() => removeItem(item.id)}
                              className="w-full px-3 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            >
                              <Minus className="h-4 w-4 mx-auto" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Details */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={invoiceData.taxRate}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={invoiceData.discount}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={invoiceData.notes}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Payment terms, notes, etc."
                    />
                  </div>
                </div>
              </div>

              {/* Download Button */}
              <div className="pt-6">
                <button
                  onClick={downloadPDF}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Download PDF Invoice
                </button>
              </div>
            </div>
          </div>

          {/* Invoice Preview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Invoice Preview</h2>
              <button
                onClick={downloadPDF}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </button>
            </div>

            <div
              id="invoice-preview"
              className="bg-white border border-gray-200 rounded-lg p-8 max-w-4xl mx-auto"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {/* Invoice Header */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-blue-600 mb-2">INVOICE</h1>
                  <div className="text-gray-600">
                    <p className="font-semibold">{invoiceData.companyName}</p>
                    <p>{invoiceData.companyAddress}</p>
                    <p>{invoiceData.companyCity}, {invoiceData.companyState} {invoiceData.companyZip}</p>
                    <p>{invoiceData.companyPhone}</p>
                    <p>{invoiceData.companyEmail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-lg mb-4">
                    <p className="text-sm">Invoice #{invoiceData.invoiceNumber}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p><span className="font-semibold">Date:</span> {new Date(invoiceData.invoiceDate).toLocaleDateString()}</p>
                    <p><span className="font-semibold">Due Date:</span> {new Date(invoiceData.dueDate).toLocaleDateString()}</p>
                    {invoiceData.poNumber && <p><span className="font-semibold">PO #:</span> {invoiceData.poNumber}</p>}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Bill To:</h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold text-gray-800">{invoiceData.clientName || 'Client Name'}</p>
                  {invoiceData.clientAddress && <p className="text-gray-600">{invoiceData.clientAddress}</p>}
                  {(invoiceData.clientCity || invoiceData.clientState || invoiceData.clientZip) && (
                    <p className="text-gray-600">
                      {invoiceData.clientCity}{invoiceData.clientCity && invoiceData.clientState && ', '}
                      {invoiceData.clientState} {invoiceData.clientZip}
                    </p>
                  )}
                  {invoiceData.clientPhone && <p className="text-gray-600">{invoiceData.clientPhone}</p>}
                  {invoiceData.clientEmail && <p className="text-gray-600">{invoiceData.clientEmail}</p>}
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-8">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Description</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">Qty</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700">Rate</th>
                      <th className="border border-gray-300 px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.items.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-4 py-3 text-gray-800">
                          {item.description || 'Item description'}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-center text-gray-800">
                          {item.quantity}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-center text-gray-800">
                          ${item.rate.toFixed(2)}
                        </td>
                        <td className="border border-gray-300 px-4 py-3 text-right text-gray-800">
                          ${item.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end mb-8">
                <div className="w-64">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="font-semibold text-gray-700">Subtotal:</span>
                    <span className="text-gray-800">${calculateSubtotal().toFixed(2)}</span>
                  </div>
                  {invoiceData.taxRate > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Tax ({invoiceData.taxRate}%):</span>
                      <span className="text-gray-800">${calculateTax().toFixed(2)}</span>
                    </div>
                  )}
                  {invoiceData.discount > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="font-semibold text-gray-700">Discount:</span>
                      <span className="text-gray-800">-${invoiceData.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 text-lg font-bold text-gray-900 border-t-2 border-gray-300">
                    <span>Total:</span>
                    <span>${calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {invoiceData.notes && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Notes:</h3>
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <p className="text-blue-800">{invoiceData.notes}</p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-center text-gray-500 text-sm border-t border-gray-200 pt-6">
                <p>Thank you for your business!</p>
                <p className="mt-2">Generated by PiPilot - AI-Powered App Development</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
