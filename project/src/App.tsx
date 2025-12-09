import { useState, useEffect, useMemo } from 'react';
import {
  format,
  getDay,
  addMonths,
  subMonths,
  getMonth,
  getYear,
  isBefore,
  isAfter,
  isSameDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Truck,
  Moon,
  Sun,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Wallet,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  X,
  FileText,
  LogOut,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CUTOFF_DAY = 26;

interface DayData {
  date: string;
  startTime: string;
  endTime: string;
  dietaInt: number;
  extra: number;
  pernocta: number;
  propinas: number;
}

interface TimesheetData {
  [date: string]: DayData;
}

interface MonthlySummary {
  totalHours: number;
  daysWorked: number;
  dietaNormalUnits: number;
  dietaFindeUnits: number;
  nocturnidadMoney: number;
  dietaIntMoney: number;
  extraMoney: number;
  pernoctaMoney: number;
  propinasMoney: number;
  totalMoney: number;
}

interface FiscalDateRange {
  startDate: Date;
  endDate: Date;
  startMonthKey: string;
  endMonthKey: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [darkMode, setDarkMode] = useState(false);
  const [showPropinas, setShowPropinas] = useState(true);
  const [allData, setAllData] = useState<TimesheetData>({});
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [pdfStartDate, setPdfStartDate] = useState('');
  const [pdfEndDate, setPdfEndDate] = useState('');

  useEffect(() => {
    const storedPin = localStorage.getItem('app-pin');
    if (storedPin) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    if (pinInput.length === 4 && /^\d+$/.test(pinInput)) {
      localStorage.setItem('app-pin', pinInput);
      setIsAuthenticated(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('app-pin');
    setPinInput('');
  };

  const getFiscalMonthRange = (date: Date): FiscalDateRange => {
    const year = getYear(date);
    const month = getMonth(date);

    let startDate: Date;
    let startMonthKey: string;
    let endMonthKey: string;

    if (month === 0) {
      startDate = new Date(year - 1, 11, CUTOFF_DAY);
      startMonthKey = `${year - 1}-${String(12).padStart(2, '0')}`;
    } else {
      startDate = new Date(year, month - 1, CUTOFF_DAY);
      startMonthKey = format(startDate, 'yyyy-MM');
    }

    const endDate = new Date(year, month, CUTOFF_DAY - 1);
    endMonthKey = format(endDate, 'yyyy-MM');

    return { startDate, endDate, startMonthKey, endMonthKey };
  };

  const loadFiscalMonthData = (date: Date): TimesheetData => {
    const range = getFiscalMonthRange(date);
    const combinedData: TimesheetData = {};

    const startMonthData = localStorage.getItem(`timesheet-${range.startMonthKey}`);
    const endMonthData = localStorage.getItem(`timesheet-${range.endMonthKey}`);

    if (startMonthData) {
      const parsed = JSON.parse(startMonthData);
      Object.keys(parsed).forEach((dateStr: string) => {
        const dayNum = parseInt(dateStr.split('-')[2]);
        if (dayNum >= CUTOFF_DAY) {
          combinedData[dateStr] = parsed[dateStr];
        }
      });
    }

    if (endMonthData) {
      const parsed = JSON.parse(endMonthData);
      Object.keys(parsed).forEach((dateStr: string) => {
        const dayNum = parseInt(dateStr.split('-')[2]);
        if (dayNum < CUTOFF_DAY) {
          combinedData[dateStr] = parsed[dateStr];
        }
      });
    }

    return combinedData;
  };

  const saveFiscalMonthData = (date: Date, data: TimesheetData) => {
    const range = getFiscalMonthRange(date);

    const startMonthData: TimesheetData = {};
    const endMonthData: TimesheetData = {};

    Object.keys(data).forEach((dateStr: string) => {
      const dayNum = parseInt(dateStr.split('-')[2]);
      if (dayNum >= CUTOFF_DAY) {
        startMonthData[dateStr] = data[dateStr];
      } else {
        endMonthData[dateStr] = data[dateStr];
      }
    });

    if (Object.keys(startMonthData).length > 0) {
      const existing = localStorage.getItem(`timesheet-${range.startMonthKey}`);
      const merged = { ...JSON.parse(existing || '{}'), ...startMonthData };
      localStorage.setItem(`timesheet-${range.startMonthKey}`, JSON.stringify(merged));
    }

    if (Object.keys(endMonthData).length > 0) {
      const existing = localStorage.getItem(`timesheet-${range.endMonthKey}`);
      const merged = { ...JSON.parse(existing || '{}'), ...endMonthData };
      localStorage.setItem(`timesheet-${range.endMonthKey}`, JSON.stringify(merged));
    }
  };

  useEffect(() => {
    const fiscalData = loadFiscalMonthData(currentDate);
    setAllData(fiscalData);
  }, [currentDate]);

  useEffect(() => {
    if (Object.keys(allData).length > 0) {
      saveFiscalMonthData(currentDate, allData);
    }
  }, [allData, currentDate]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    return (endMinutes - startMinutes) / 60;
  };

  const calculateDietaNormal = (hours: number): number => {
    if (hours === 0) return 0;
    if (hours > 12) return 2;
    return 1;
  };

  const calculateDietaFinde = (hours: number): number => {
    if (hours <= 3) return 0;
    if (hours > 12) return 2;
    return 1;
  };

  const calculateNocturnidad = (endTime: string): number => {
    if (!endTime) return 0;

    const [hour] = endTime.split(':').map(Number);

    if (hour >= 22 || hour <= 2) {
      return 20;
    }

    if (hour >= 3 && hour <= 9) {
      return 40;
    }

    return 0;
  };

  const getAllTimeSheetData = (): { [dateStr: string]: DayData } => {
    const allTimesheetData: { [dateStr: string]: DayData } = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('timesheet-')) {
        const data = localStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          Object.assign(allTimesheetData, parsed);
        }
      }
    }

    return allTimesheetData;
  };

  const isDateInRange = (dateStr: string, startDate: Date, endDate: Date): boolean => {
    const date = new Date(dateStr);
    return (isBefore(date, endDate) || isSameDay(date, endDate)) && (isAfter(date, startDate) || isSameDay(date, startDate));
  };

  const generatePdfReport = () => {
    if (!pdfStartDate || !pdfEndDate) {
      alert('Por favor selecciona ambas fechas');
      return;
    }

    const startDate = new Date(pdfStartDate);
    const endDate = new Date(pdfEndDate);

    if (isAfter(startDate, endDate)) {
      alert('La fecha de inicio debe ser anterior a la fecha de fin');
      return;
    }

    const allData = getAllTimeSheetData();
    const filteredData: { [dateStr: string]: DayData } = {};

    Object.keys(allData).forEach((dateStr: string) => {
      if (isDateInRange(dateStr, startDate, endDate)) {
        filteredData[dateStr] = allData[dateStr];
      }
    });

    const sortedDates = Object.keys(filteredData).sort();

    let totalHours = 0;
    let daysWorked = 0;
    let dietaNormalUnits = 0;
    let dietaFindeUnits = 0;
    let nocturnidadMoney = 0;
    let dietaIntMoney = 0;
    let extraMoney = 0;
    let pernoctaMoney = 0;
    let propinasMoney = 0;

    const tableData: any[] = [];

    sortedDates.forEach((dateStr: string) => {
      const dayData = filteredData[dateStr];
      const date = new Date(dateStr);
      const dayOfWeek = getDay(date);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const hours = calculateHours(dayData.startTime, dayData.endTime);
      const dietaNormal = !isWeekend ? calculateDietaNormal(hours) : 0;
      const dietaFinde = isWeekend ? calculateDietaFinde(hours) : 0;
      const nocturnidad = calculateNocturnidad(dayData.endTime);

      if (hours > 0) daysWorked++;
      totalHours += hours;
      dietaNormalUnits += dietaNormal;
      dietaFindeUnits += dietaFinde;
      nocturnidadMoney += nocturnidad;
      dietaIntMoney += dayData.dietaInt * 25;
      extraMoney += dayData.extra * 120;
      pernoctaMoney += dayData.pernocta * 40;
      propinasMoney += dayData.propinas;

      const row = [
        format(date, 'dd/MM/yyyy'),
        dayData.startTime || '-',
        dayData.endTime || '-',
        hours.toFixed(2),
        dietaNormal || '-',
        dietaFinde || '-',
        nocturnidad ? `${nocturnidad}€` : '-',
        dayData.dietaInt || '-',
        dayData.extra || '-',
        dayData.pernocta || '-',
      ];

      if (showPropinas) {
        row.push(dayData.propinas ? dayData.propinas.toFixed(2) : '-');
      }

      tableData.push(row);
    });

    const dietaNormalMoney = dietaNormalUnits * 15;
    const dietaFindeMoney = dietaFindeUnits * 20;
    const totalDietas = dietaNormalMoney + dietaFindeMoney;
    const totalExtras = dietaIntMoney + extraMoney + pernoctaMoney + (showPropinas ? propinasMoney : 0);
    const totalMoney = totalDietas + nocturnidadMoney + totalExtras;

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPosition = 15;

    pdf.setFontSize(16);
    pdf.text(`Reporte de Actividad`, pageWidth / 2, yPosition, { align: 'center' });

    yPosition += 8;
    pdf.setFontSize(11);
    pdf.text(`${format(startDate, 'd MMM yyyy', { locale: es })} al ${format(endDate, 'd MMM yyyy', { locale: es })}`, pageWidth / 2, yPosition, { align: 'center' });

    yPosition += 12;
    pdf.setFontSize(10);
    pdf.text(`Total Ingresos: ${totalMoney.toFixed(2)}€`, 15, yPosition);
    yPosition += 6;
    pdf.text(`Total Horas: ${totalHours.toFixed(2)}h`, 15, yPosition);
    yPosition += 6;
    pdf.text(`Días Trabajados: ${daysWorked}`, 15, yPosition);

    yPosition += 10;

    const columns = [
      'Fecha',
      'Inicio',
      'Fin',
      'Horas',
      'D. Normal',
      'D. Finde',
      'Nocturnidad',
      'D. Int',
      'Extra',
      'Pernocta',
    ];

    if (showPropinas) {
      columns.push('Propinas');
    }

    autoTable(pdf, {
      head: [columns],
      body: tableData,
      startY: yPosition,
      theme: 'grid',
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [0, 0, 0],
      },
      alternateRowStyles: {
        fillColor: [243, 244, 246],
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'center' },
        9: { halign: 'center' },
        10: { halign: 'right' },
      },
      margin: 15,
    });

    const filename = `Reporte_${format(startDate, 'dd-MM-yyyy')}_al_${format(endDate, 'dd-MM-yyyy')}.pdf`;
    pdf.save(filename);

    setShowPdfExport(false);
    setPdfStartDate('');
    setPdfEndDate('');
  };

  const range = useMemo(() => getFiscalMonthRange(currentDate), [currentDate]);

  const days = useMemo(() => {
    const daysList: any[] = [];
    const sortedDates = (Object.keys(allData) as Array<string>).sort();

    sortedDates.forEach((dateStr: string) => {
      const date = new Date(dateStr);
      const dayOfWeek = getDay(date);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const dayData = allData[dateStr] || {
        date: dateStr,
        startTime: '',
        endTime: '',
        dietaInt: 0,
        extra: 0,
        pernocta: 0,
        propinas: 0,
      };

      const hours = calculateHours(dayData.startTime, dayData.endTime);
      const dietaNormal = !isWeekend ? calculateDietaNormal(hours) : 0;
      const dietaFinde = isWeekend ? calculateDietaFinde(hours) : 0;
      const nocturnidad = calculateNocturnidad(dayData.endTime);

      daysList.push({
        ...dayData,
        date,
        dateStr,
        dayOfWeek,
        isWeekend,
        hours,
        dietaNormal,
        dietaFinde,
        nocturnidad,
      });
    });

    return daysList;
  }, [allData]);

  const summary = useMemo(() => {
    let totalHours = 0;
    let daysWorked = 0;
    let dietaNormalMoney = 0;
    let dietaFindeMoney = 0;
    let dietaNormalUnits = 0;
    let dietaFindeUnits = 0;
    let nocturnidadMoney = 0;
    let dietaIntMoney = 0;
    let extraMoney = 0;
    let pernoctaMoney = 0;
    let propinasMoney = 0;

    days.forEach(day => {
      if (day.hours > 0) daysWorked++;
      totalHours += day.hours;
      dietaNormalUnits += day.dietaNormal;
      dietaFindeUnits += day.dietaFinde;
      dietaNormalMoney += day.dietaNormal * 15;
      dietaFindeMoney += day.dietaFinde * 20;
      nocturnidadMoney += day.nocturnidad;
      dietaIntMoney += day.dietaInt * 25;
      extraMoney += day.extra * 120;
      pernoctaMoney += day.pernocta * 40;
      propinasMoney += day.propinas;
    });

    const totalDietas = dietaNormalMoney + dietaFindeMoney;
    const totalExtras = dietaIntMoney + extraMoney + pernoctaMoney + (showPropinas ? propinasMoney : 0);
    const totalMoney = totalDietas + nocturnidadMoney + totalExtras;

    return {
      totalHours: totalHours.toFixed(2),
      daysWorked,
      totalMoney: totalMoney.toFixed(2),
      totalExtras: totalExtras.toFixed(2),
      dietaNormalMoney: dietaNormalMoney.toFixed(2),
      dietaFindeMoney: dietaFindeMoney.toFixed(2),
      dietaNormalUnits,
      dietaFindeUnits,
      totalDietas: totalDietas.toFixed(2),
      nocturnidadMoney: nocturnidadMoney.toFixed(2),
      dietaIntMoney: dietaIntMoney.toFixed(2),
      extraMoney: extraMoney.toFixed(2),
      pernoctaMoney: pernoctaMoney.toFixed(2),
      propinasMoney: propinasMoney.toFixed(2),
    };
  }, [days, showPropinas]);

  const updateDayData = (dateStr: string, field: keyof DayData, value: string | number) => {
    setAllData(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {
          date: dateStr,
          startTime: '',
          endTime: '',
          dietaInt: 0,
          extra: 0,
          pernocta: 0,
          propinas: 0,
        }),
        [field]: value,
      },
    }));
  };

  const getAnnualSummary = (): MonthlySummary => {
    let totalHours = 0;
    let daysWorked = 0;
    let dietaNormalUnits = 0;
    let dietaFindeUnits = 0;
    let nocturnidadMoney = 0;
    let dietaIntMoney = 0;
    let extraMoney = 0;
    let pernoctaMoney = 0;
    let propinasMoney = 0;

    const year = getYear(currentDate);

    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(year, month, 1);
      const fiscalRange = getFiscalMonthRange(monthDate);

      const startMonthData = localStorage.getItem(`timesheet-${fiscalRange.startMonthKey}`);
      const endMonthData = localStorage.getItem(`timesheet-${fiscalRange.endMonthKey}`);

      const processData = (data: TimesheetData, isStartMonth: boolean) => {
        Object.keys(data).forEach((dateStr: string) => {
          const dayNum = parseInt(dateStr.split('-')[2]);
          const isInRange = isStartMonth ? dayNum >= CUTOFF_DAY : dayNum < CUTOFF_DAY;

          if (!isInRange) return;

          const dayData = data[dateStr];
          const date = new Date(dateStr);
          const dayOfWeek = getDay(date);
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          const hours = calculateHours(dayData.startTime, dayData.endTime);

          if (hours > 0) daysWorked++;
          totalHours += hours;

          const dietaNormal = !isWeekend ? calculateDietaNormal(hours) : 0;
          const dietaFinde = isWeekend ? calculateDietaFinde(hours) : 0;
          const nocturnidad = calculateNocturnidad(dayData.endTime);

          dietaNormalUnits += dietaNormal;
          dietaFindeUnits += dietaFinde;
          nocturnidadMoney += nocturnidad;
          dietaIntMoney += dayData.dietaInt * 25;
          extraMoney += dayData.extra * 120;
          pernoctaMoney += dayData.pernocta * 40;
          propinasMoney += dayData.propinas;
        });
      };

      if (startMonthData) {
        processData(JSON.parse(startMonthData), true);
      }
      if (endMonthData) {
        processData(JSON.parse(endMonthData), false);
      }
    }

    const dietaNormalMoney = dietaNormalUnits * 15;
    const dietaFindeMoney = dietaFindeUnits * 20;
    const totalDietas = dietaNormalMoney + dietaFindeMoney;
    const totalExtras = dietaIntMoney + extraMoney + pernoctaMoney + (showPropinas ? propinasMoney : 0);
    const totalMoney = totalDietas + nocturnidadMoney + totalExtras;

    return {
      totalHours,
      daysWorked,
      dietaNormalUnits,
      dietaFindeUnits,
      nocturnidadMoney,
      dietaIntMoney,
      extraMoney,
      pernoctaMoney,
      propinasMoney,
      totalMoney,
    };
  };

  const annualSummary = useMemo(() => getAnnualSummary(), [showPropinas, currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const fiscalMonthLabel = format(currentDate, 'MMMM yyyy', { locale: es });
  const dateRangeLabel = `${format(range.startDate, 'd MMM', { locale: es })} - ${format(range.endDate, 'd MMM yyyy', { locale: es })}`;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-600 rounded-lg">
              <Truck className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
            Driver Timesheet
          </h1>
          <p className="text-center text-slate-600 dark:text-slate-400 mb-8">
            Ingresa tu código PIN para acceder
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Código PIN (4 dígitos)
              </label>
              <input
                type="password"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-2 text-center text-2xl tracking-widest border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="0000"
                autoFocus
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={pinInput.length !== 4}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-semibold transition-colors"
            >
              Acceder
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            Introduce un PIN de 4 dígitos. Se guardará para tu próxima sesión.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Truck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                Driver Timesheet
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Nómina (Payroll Cycle)</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowPropinas(!showPropinas)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg transition-colors flex items-center gap-2"
            >
              {showPropinas ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {showPropinas ? 'Ocultar' : 'Mostrar'} Propinas
            </button>
            <button
              onClick={() => setShowPdfExport(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Exportar PDF
            </button>
            <button
              onClick={() => setShowAnnualSummary(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Resumen Anual
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-slate-800 dark:text-slate-200" />
          </button>
          <div className="text-center flex-1">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2">
              <Calendar className="w-6 h-6" />
              Nómina {fiscalMonthLabel}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{dateRangeLabel}</p>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronRight className="w-6 h-6 text-slate-800 dark:text-slate-200" />
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Wallet className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Extra</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {summary.totalExtras}€
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Horas</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {summary.totalHours}h
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Días Trabajados</h3>
            </div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {summary.daysWorked}
            </p>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6 mb-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Desglose Detallado</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Dieta Normal</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.dietaNormalMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Dieta Finde</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.dietaFindeMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Dietas</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{summary.totalDietas}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Nocturnidad</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.nocturnidadMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Dieta Int</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.dietaIntMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Extra</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.extraMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Pernocta</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.pernoctaMoney}€</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Propinas</p>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{summary.propinasMoney}€</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-slate-700 dark:text-slate-300">Total General</span>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.totalMoney}€</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100 dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Inicio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Fin</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Horas</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Dieta Normal</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Dieta Finde</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Nocturnidad</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Dieta Int</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Extra</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Pernocta</th>
                  {showPropinas && (
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Propinas</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {days.map((day) => (
                  <tr
                    key={day.dateStr}
                    className={`
                      ${day.isWeekend ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-800'}
                      hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors
                    `}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {format(day.date, 'dd/MM')}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {format(day.date, 'EEE', { locale: es })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => updateDayData(day.dateStr, 'startTime', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => updateDayData(day.dateStr, 'endTime', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {day.hours.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${day.dietaNormal > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`}>
                        {day.dietaNormal > 0 ? day.dietaNormal : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${day.dietaFinde > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-600'}`}>
                        {day.dietaFinde > 0 ? day.dietaFinde : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${day.nocturnidad > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-600'}`}>
                        {day.nocturnidad > 0 ? `${day.nocturnidad}€` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        value={day.dietaInt || ''}
                        onChange={(e) => updateDayData(day.dateStr, 'dietaInt', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-sm text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        value={day.extra || ''}
                        onChange={(e) => updateDayData(day.dateStr, 'extra', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-sm text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        value={day.pernocta || ''}
                        onChange={(e) => updateDayData(day.dateStr, 'pernocta', parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-sm text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    {showPropinas && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={day.propinas || ''}
                          onChange={(e) => updateDayData(day.dateStr, 'propinas', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-sm text-center border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PDF Export Modal */}
      {showPdfExport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-md w-full border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                Exportar Reporte PDF
              </h2>
              <button
                onClick={() => setShowPdfExport(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-800 dark:text-slate-200" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  value={pdfStartDate}
                  onChange={(e) => setPdfStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  value={pdfEndDate}
                  onChange={(e) => setPdfEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowPdfExport(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={generatePdfReport}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-semibold"
                >
                  Generar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Annual Summary Modal */}
      {showAnnualSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                Resumen Anual {getYear(currentDate)} (Nóminas)
              </h2>
              <button
                onClick={() => setShowAnnualSummary(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-slate-800 dark:text-slate-200" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Ingresos</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {annualSummary.totalMoney.toFixed(2)}€
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Horas</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {annualSummary.totalHours.toFixed(2)}h
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Días Trabajados</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {annualSummary.daysWorked}
                  </p>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Desglose por Categoría</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Unidades Dieta Normal</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{annualSummary.dietaNormalUnits}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(annualSummary.dietaNormalUnits * 15).toFixed(2)}€</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Unidades Dieta Finde</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{annualSummary.dietaFindeUnits}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(annualSummary.dietaFindeUnits * 20).toFixed(2)}€</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Dietas</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {((annualSummary.dietaNormalUnits * 15) + (annualSummary.dietaFindeUnits * 20)).toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Nocturnidad</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {annualSummary.nocturnidadMoney.toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Dieta Int</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {annualSummary.dietaIntMoney.toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Extra</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {annualSummary.extraMoney.toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Pernocta</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {annualSummary.pernoctaMoney.toFixed(2)}€
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Propinas</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {annualSummary.propinasMoney.toFixed(2)}€
                    </p>
                  </div>
                </div>
              </div>

              {/* Total Summary */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-lg p-6 border border-green-200 dark:border-green-800">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-semibold text-slate-700 dark:text-slate-300">Total General (Año {getYear(currentDate)})</span>
                  <span className="text-4xl font-bold text-green-600 dark:text-green-400">{annualSummary.totalMoney.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
