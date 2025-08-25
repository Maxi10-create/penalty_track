// ASV Natz Penalty Tracker JavaScript

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('ASV Natz Penalty Tracker loaded');
    
    // Initialize tooltips if Bootstrap is available
    if (typeof bootstrap !== 'undefined') {
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
    
    // Auto-dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(function(alert) {
        if (alert.classList.contains('alert-success')) {
            setTimeout(function() {
                const bootstrapAlert = new bootstrap.Alert(alert);
                bootstrapAlert.close();
            }, 5000);
        }
    });
});

// Utility functions
const PenaltyTracker = {
    
    // Format currency
    formatCurrency: function(amount) {
        return parseFloat(amount).toFixed(2) + '€';
    },
    
    // Format date
    formatDate: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE');
    },
    
    // Show loading state
    showLoading: function(element) {
        if (element) {
            element.classList.add('loading');
            element.disabled = true;
        }
    },
    
    // Hide loading state
    hideLoading: function(element) {
        if (element) {
            element.classList.remove('loading');
            element.disabled = false;
        }
    },
    
    // Show confirmation dialog
    confirm: function(message, callback) {
        if (confirm(message)) {
            callback();
        }
    },
    
    // AJAX request helper
    ajax: function(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        const config = Object.assign(defaultOptions, options);
        
        return fetch(url, config)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .catch(error => {
                console.error('AJAX Error:', error);
                throw error;
            });
    },
    
    // Update penalty amount preview
    updateAmountPreview: function(penaltySelectId, quantityInputId, previewId) {
        const penaltySelect = document.getElementById(penaltySelectId);
        const quantityInput = document.getElementById(quantityInputId);
        const preview = document.getElementById(previewId);
        
        if (!penaltySelect || !quantityInput || !preview) return;
        
        const selectedOption = penaltySelect.options[penaltySelect.selectedIndex];
        const amount = selectedOption.dataset.amount;
        const quantity = parseInt(quantityInput.value) || 1;
        
        if (amount) {
            const total = parseFloat(amount) * quantity;
            preview.innerHTML = `${quantity}x ${this.formatCurrency(amount)} = <strong>${this.formatCurrency(total)}</strong>`;
        } else {
            preview.innerHTML = 'Wählen Sie ein Vergehen aus';
        }
    },
    
    // Load chart data and create chart
    createChart: function(canvasId, apiUrl, chartType = 'line') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        this.ajax(apiUrl)
            .then(data => {
                const ctx = canvas.getContext('2d');
                new Chart(ctx, {
                    type: chartType,
                    data: {
                        labels: data.dates,
                        datasets: [{
                            label: 'Strafen (€)',
                            data: data.amounts,
                            backgroundColor: chartType === 'line' ? 
                                'rgba(54, 162, 235, 0.2)' : 
                                'rgba(54, 162, 235, 0.8)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: chartType === 'line' ? 2 : 1,
                            fill: chartType === 'line'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return value + '€';
                                    }
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            })
            .catch(error => {
                console.error('Error loading chart data:', error);
                canvas.style.display = 'none';
            });
    },
    
    // Initialize data tables if available
    initializeDataTables: function() {
        if (typeof $ !== 'undefined' && $.fn.DataTable) {
            $('.data-table').DataTable({
                language: {
                    url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/de-DE.json'
                },
                pageLength: 25,
                responsive: true,
                order: [[0, 'desc']] // Order by date descending
            });
        }
    }
};

// Form validation helpers
const FormValidation = {
    
    // Validate penalty form
    validatePenaltyForm: function(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;
        
        const date = form.querySelector('[name="date"]');
        const player = form.querySelector('[name="player_id"]');
        const penaltyType = form.querySelector('[name="penalty_type_id"]');
        const quantity = form.querySelector('[name="quantity"]');
        
        let isValid = true;
        let errors = [];
        
        // Validate date
        if (!date.value) {
            errors.push('Datum ist erforderlich');
            date.classList.add('is-invalid');
            isValid = false;
        } else {
            date.classList.remove('is-invalid');
        }
        
        // Validate player
        if (!player.value) {
            errors.push('Spieler auswählen ist erforderlich');
            player.classList.add('is-invalid');
            isValid = false;
        } else {
            player.classList.remove('is-invalid');
        }
        
        // Validate penalty type
        if (!penaltyType.value) {
            errors.push('Vergehen auswählen ist erforderlich');
            penaltyType.classList.add('is-invalid');
            isValid = false;
        } else {
            penaltyType.classList.remove('is-invalid');
        }
        
        // Validate quantity
        if (!quantity.value || parseInt(quantity.value) < 1) {
            errors.push('Anzahl muss mindestens 1 sein');
            quantity.classList.add('is-invalid');
            isValid = false;
        } else {
            quantity.classList.remove('is-invalid');
        }
        
        // Show errors
        if (!isValid) {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-danger alert-dismissible fade show';
            alertDiv.innerHTML = `
                <strong>Bitte korrigieren Sie folgende Fehler:</strong>
                <ul class="mb-0">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            
            form.insertBefore(alertDiv, form.firstChild);
        }
        
        return isValid;
    }
};

// Export for global access
window.PenaltyTracker = PenaltyTracker;
window.FormValidation = FormValidation;