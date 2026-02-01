const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

class InvoiceService {
    constructor() {
        this.colors = {
            primary: '#2563eb', // Blue
            secondary: '#64748b', // Slate
            text: '#1e293b', // Dark Slate
            border: '#e2e8f0' // Light Gray
        };
    }

    generateInvoiceStream(order, res) {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        // Pipe directly to response
        doc.pipe(res);

        this.generateHeader(doc, order);
        this.generateCustomerDetails(doc, order);
        this.generateInvoiceTable(doc, order);
        this.generateFooter(doc, order);

        doc.end();
    }

    generateHeader(doc, order) {
        doc.fillColor(this.colors.primary)
            .fontSize(20)
            .text('AUTO HUB', 50, 57)
            .fontSize(10)
            .text('Auto Hub Marketplace', 200, 50, { align: 'right' })
            .text('Bangalore, India', 200, 65, { align: 'right' })
            .text('support@autohub.com', 200, 80, { align: 'right' })
            .moveDown();

        doc.fillColor(this.colors.text)
            .fontSize(20)
            .text('INVOICE', 50, 160);

        this.generateHr(doc, 185);
    }

    generateCustomerDetails(doc, order) {
        doc.fontSize(10)
            .text(`Invoice Number: ${order.orderNumber}`, 50, 200)
            .text(`Invoice Date: ${new Date().toLocaleDateString()}`, 50, 215)
            .text(`Order Date: ${new Date(order.orderedAt).toLocaleDateString()}`, 50, 230)

            .text('Bill To:', 300, 200)
            .font('Helvetica-Bold')
            .text(order.shippingAddress.fullName, 300, 215)
            .font('Helvetica')
            .text(order.shippingAddress.addressLine1, 300, 230)
            .text(`${order.shippingAddress.city}, ${order.shippingAddress.state}, ${order.shippingAddress.zipCode}`, 300, 245)
            .moveDown();

        this.generateHr(doc, 265);
    }

    generateInvoiceTable(doc, order) {
        let i;
        const invoiceTableTop = 330;
        const fontBold = 'Helvetica-Bold';
        const fontRegular = 'Helvetica';

        doc.font(fontBold);
        this.generateTableRow(
            doc,
            invoiceTableTop,
            "Item",
            "Unit Price",
            "Quantity",
            "Line Total"
        );
        this.generateHr(doc, invoiceTableTop + 20);
        doc.font(fontRegular);

        let position = 0;

        order.items.forEach((item, index) => {
            position = invoiceTableTop + (index + 1) * 30;
            this.generateTableRow(
                doc,
                position,
                item.name.substring(0, 30) + (item.name.length > 30 ? '...' : ''), // Truncate name
                this.formatCurrency(item.price),
                item.quantity,
                this.formatCurrency(item.price * item.quantity)
            );
            this.generateHr(doc, position + 20);
        });

        const subtotalPosition = position + 40;
        this.generateTotalRow(doc, subtotalPosition, 'Subtotal', this.formatCurrency(order.subtotal));
        this.generateTotalRow(doc, subtotalPosition + 25, 'Shipping', this.formatCurrency(order.shippingCharge || 0));
        this.generateTotalRow(doc, subtotalPosition + 50, 'Tax', this.formatCurrency(order.tax || 0));

        doc.font(fontBold).fontSize(14).fillColor(this.colors.primary);
        this.generateTotalRow(doc, subtotalPosition + 85, 'Total', this.formatCurrency(order.totalAmount));
    }

    generateFooter(doc, order) {
        doc.fontSize(10)
            .fillColor(this.colors.secondary)
            .text(
                'Payment is due within 15 days. Thank you for your business.',
                50,
                780,
                { align: 'center', width: 500 }
            );
    }

    generateTableRow(doc, y, item, unitCost, quantity, lineTotal) {
        doc.fontSize(10)
            .fillColor(this.colors.text)
            .text(item, 50, y)
            .text(unitCost, 280, y, { width: 90, align: 'right' })
            .text(quantity, 370, y, { width: 90, align: 'right' })
            .text(lineTotal, 0, y, { align: 'right' });
    }

    generateTotalRow(doc, y, label, value) {
        doc.fontSize(10)
            .text(label, 300, y, { width: 90, align: 'right' })
            .text(value, 0, y, { align: 'right' });
    }

    generateHr(doc, y) {
        doc.strokeColor(this.colors.border)
            .lineWidth(1)
            .moveTo(50, y)
            .lineTo(550, y)
            .stroke();
    }

    formatCurrency(amount) {
        return "INR " + (amount).toFixed(2);
    }
}

module.exports = new InvoiceService();
